from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import modal

PROJECT_ROOT = Path(__file__).resolve().parent
REMOTE_PACKAGE_ROOT = "/opt/unmarker-src"
HF_CACHE_ROOT = "/hf-cache"
RUNS_ROOT = Path("/generic-runs")
MODELS_ROOT = Path("/open-models")

COLING_DATASET = "Jinyan1/COLING_2025_MGT_multingual"
COLING_REVISION = "da603651a8929a3790937c2c2b01bde23662111f"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .uv_pip_install(
        "torch==2.5.1",
        "transformers==4.46.3",
        "datasets==3.1.0",
        "accelerate==1.1.1",
        "scikit-learn==1.5.2",
        "sentencepiece==0.2.0",
        "numpy==1.26.4",
        "huggingface-hub==0.26.2",
    )
    .add_local_dir(PROJECT_ROOT / "src", remote_path=REMOTE_PACKAGE_ROOT, copy=True)
    .env(
        {
            "HF_HOME": HF_CACHE_ROOT,
            "HF_HUB_ENABLE_HF_TRANSFER": "0",
            "TOKENIZERS_PARALLELISM": "false",
            "PYTHONPATH": REMOTE_PACKAGE_ROOT,
        }
    )
)

app = modal.App("unmarker-open-text-detectors")
hf_cache = modal.Volume.from_name("unmarker-huggingface-cache", create_if_missing=True)
run_volume = modal.Volume.from_name(
    "unmarker-generic-detector-runs", create_if_missing=True
)
model_volume = modal.Volume.from_name(
    "unmarker-open-detector-models", create_if_missing=True
)
volumes = {
    HF_CACHE_ROOT: hf_cache,
    str(RUNS_ROOT): run_volume,
    str(MODELS_ROOT): model_volume,
}


@app.function(
    image=image,
    gpu="L40S",
    cpu=8,
    memory=65_536,
    timeout=86_400,
    retries=modal.Retries(max_retries=1, initial_delay=10.0),
    volumes=volumes,
)
def train_xlmr(
    model_id: str,
    train_per_language_label: int = 10_000,
    dev_per_language_label: int = 2_000,
    italian_train_per_label: int = 4_000,
    italian_dev_per_label: int = 1_000,
    wikipedia_exclusions_json: str = "{}",
    seed: int = 20260827,
    epochs: float = 2.0,
    max_length: int = 256,
) -> dict:
    import shutil

    import numpy as np
    from sklearn.metrics import accuracy_score, f1_score
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
        set_seed,
    )

    from datasets import Dataset, load_dataset
    from unmarker_text_bench.detector_controls import (
        CONFIGS as WIKIPEDIA_CONFIGS,
    )
    from unmarker_text_bench.detector_controls import (
        DATASET_NAME as WIKIPEDIA_DATASET,
    )
    from unmarker_text_bench.detector_controls import (
        DATASET_REVISION as WIKIPEDIA_REVISION,
    )
    from unmarker_text_bench.generic_detectors import utc_now, write_json
    from unmarker_text_bench.open_detector_models import (
        XLMR_BASE_MODEL,
        XLMR_BASE_REVISION,
    )

    _validate_identifier(model_id)
    if (
        min(
            train_per_language_label,
            dev_per_language_label,
            italian_train_per_label,
            italian_dev_per_label,
            max_length,
        )
        < 1
    ):
        raise ValueError("Training sizes and max_length must be positive")
    exclusions = json.loads(wikipedia_exclusions_json)
    excluded_article_ids = {str(value) for value in exclusions.get("article_ids", [])}
    if not excluded_article_ids:
        raise ValueError("Pinned Wikipedia article exclusions are required")
    output_dir = MODELS_ROOT / "xlmr_mgt" / model_id
    if (output_dir / "training-manifest.json").exists():
        raise ValueError(
            f"Model {model_id!r} already exists; choose a new immutable ID"
        )
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=False)
    set_seed(seed)

    train_targets = {
        ("en", 0): train_per_language_label,
        ("en", 1): train_per_language_label,
        ("it", 1): italian_train_per_label,
    }
    dev_targets = {
        ("en", 0): dev_per_language_label,
        ("en", 1): dev_per_language_label,
        ("it", 1): italian_dev_per_label,
    }
    train_rows = _targeted_rows(
        load_dataset(
            COLING_DATASET,
            split="train",
            streaming=True,
            revision=COLING_REVISION,
        ),
        train_targets,
        seed,
    )
    dev_rows = _targeted_rows(
        load_dataset(
            COLING_DATASET,
            split="dev",
            streaming=True,
            revision=COLING_REVISION,
        ),
        dev_targets,
        seed + 1,
    )
    italian_human_rows = _wikipedia_human_rows(
        load_dataset(
            WIKIPEDIA_DATASET,
            WIKIPEDIA_CONFIGS["it"],
            split="train",
            streaming=True,
            revision=WIKIPEDIA_REVISION,
        ),
        italian_train_per_label + italian_dev_per_label,
        seed + 2,
        excluded_article_ids,
    )
    train_rows.extend(italian_human_rows[:italian_train_per_label])
    dev_rows.extend(italian_human_rows[italian_train_per_label:])
    tokenizer = AutoTokenizer.from_pretrained(
        XLMR_BASE_MODEL, revision=XLMR_BASE_REVISION, cache_dir=HF_CACHE_ROOT
    )
    model = AutoModelForSequenceClassification.from_pretrained(
        XLMR_BASE_MODEL,
        revision=XLMR_BASE_REVISION,
        cache_dir=HF_CACHE_ROOT,
        num_labels=2,
        id2label={0: "human", 1: "machine"},
        label2id={"human": 0, "machine": 1},
    )

    def tokenize(batch: dict) -> dict:
        return tokenizer(
            batch["text"], truncation=True, max_length=max_length, padding=False
        )

    train_dataset = Dataset.from_list(train_rows).map(
        tokenize, batched=True, remove_columns=["text", "language"]
    )
    dev_dataset = Dataset.from_list(dev_rows).map(
        tokenize, batched=True, remove_columns=["text", "language"]
    )

    def metrics(prediction: object) -> dict:
        labels = prediction.label_ids
        predicted = np.argmax(prediction.predictions, axis=-1)
        return {
            "accuracy": accuracy_score(labels, predicted),
            "macro_f1": f1_score(labels, predicted, average="macro"),
        }

    arguments = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        num_train_epochs=epochs,
        learning_rate=2e-5,
        warmup_ratio=0.06,
        weight_decay=0.01,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=32,
        gradient_accumulation_steps=2,
        bf16=True,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_steps=50,
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        save_total_limit=1,
        report_to=[],
        seed=seed,
        data_seed=seed,
    )
    trainer = Trainer(
        model=model,
        args=arguments,
        train_dataset=train_dataset,
        eval_dataset=dev_dataset,
        tokenizer=tokenizer,
        compute_metrics=metrics,
    )
    train_output = trainer.train()
    aggregate_metrics = trainer.evaluate()
    language_metrics = {}
    for language in ("en", "it"):
        indices = [
            index for index, row in enumerate(dev_rows) if row["language"] == language
        ]
        subset = dev_dataset.select(indices)
        predicted = trainer.predict(subset)
        labels = predicted.label_ids
        classes = np.argmax(predicted.predictions, axis=-1)
        language_metrics[language] = {
            "rows": len(indices),
            "accuracy": float(accuracy_score(labels, classes)),
            "macro_f1": float(f1_score(labels, classes, average="macro")),
        }
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    manifest = {
        "artifact_schema_version": 1,
        "artifact_kind": "unmarker-xlmr-detector-training",
        "created_at": utc_now(),
        "model_id": model_id,
        "base_model": XLMR_BASE_MODEL,
        "base_revision": XLMR_BASE_REVISION,
        "dataset": COLING_DATASET,
        "dataset_revision": COLING_REVISION,
        "italian_human_dataset": WIKIPEDIA_DATASET,
        "italian_human_dataset_revision": WIKIPEDIA_REVISION,
        "italian_human_dataset_config": WIKIPEDIA_CONFIGS["it"],
        "wikipedia_exclusion_contract": {
            "excluded_article_count": len(excluded_article_ids),
            "sources": exclusions.get("sources", {}),
        },
        "seed": seed,
        "train_per_language_label": train_per_language_label,
        "dev_per_language_label": dev_per_language_label,
        "italian_train_per_label": italian_train_per_label,
        "italian_dev_per_label": italian_dev_per_label,
        "epochs": epochs,
        "max_length": max_length,
        "train_rows": len(train_rows),
        "dev_rows": len(dev_rows),
        "train_cell_rows": _cell_counts(train_rows),
        "dev_cell_rows": _cell_counts(dev_rows),
        "train_metrics": {
            key: float(value) for key, value in train_output.metrics.items()
        },
        "aggregate_dev_metrics": {
            key: float(value) for key, value in aggregate_metrics.items()
        },
        "language_dev_metrics": language_metrics,
        "limitations": [
            "This is an Unmarker-trained derivative, not an official released detector.",
            "COLING train has no Italian human rows, so disjoint pinned Wikipedia supplies the Italian human class.",
            "English uses 10k rows per class while Italian uses 4k per class because COLING exposes only 4,174 Italian machine train rows.",
            "Published COLING results show Italian can remain near chance; inspect the per-language metric before use.",
        ],
    }
    write_json(output_dir / "training-manifest.json", manifest)
    model_volume.commit()
    hf_cache.commit()
    return manifest


@app.function(
    image=image,
    gpu="L40S",
    cpu=4,
    memory=32_768,
    timeout=86_400,
    retries=modal.Retries(max_retries=2, backoff_coefficient=2.0, initial_delay=5.0),
    volumes=volumes,
)
def scan_open_detectors(
    run_id: str,
    documents_jsonl: str,
    documents_sha256: str,
    detectors: tuple[str, ...] = ("radar",),
    xlmr_model_id: str = "",
) -> dict:
    from unmarker_text_bench.generic_detectors import DetectionRunner
    from unmarker_text_bench.open_detector_models import radar_detector, xlmr_detector

    _validate_identifier(run_id)
    requested = tuple(dict.fromkeys(detectors))
    unknown = sorted(set(requested) - {"radar", "xlmr_mgt"})
    if unknown:
        raise ValueError(f"Unsupported detectors: {unknown}")
    if "xlmr_mgt" in requested:
        _validate_identifier(xlmr_model_id)
    if hashlib.sha256(documents_jsonl.encode("utf-8")).hexdigest() != documents_sha256:
        raise ValueError("Local corpus hash does not match uploaded content")

    root = RUNS_ROOT / run_id
    documents_path = root / "documents.jsonl"
    root.mkdir(parents=True, exist_ok=True)
    if (
        documents_path.exists()
        and documents_path.read_text(encoding="utf-8") != documents_jsonl
    ):
        raise ValueError("This run ID already contains a different detector corpus")
    documents_path.write_text(documents_jsonl, encoding="utf-8")
    summaries = []
    for detector_id in requested:
        detector = (
            radar_detector(device="cuda")
            if detector_id == "radar"
            else xlmr_detector(
                str(MODELS_ROOT / "xlmr_mgt" / xlmr_model_id), device="cuda"
            )
        )
        summaries.append(
            DetectionRunner(
                detector,
                max_workers=1,
                checkpoint_callback=run_volume.commit,
                checkpoint_interval=25,
            ).run(documents_path, root / detector_id, resume=True)
        )
        run_volume.commit()
        del detector
    hf_cache.commit()
    return {"runs": summaries}


@app.local_entrypoint()
def main(
    action: str,
    model_id: str = "xlmr-en-it-v1",
    run_id: str = "",
    manifest: str = "",
    output: str = "",
    detectors: str = "radar,xlmr_mgt",
    controls: str = "",
    benchmark: str = "",
    train_per_language_label: int = 10_000,
    dev_per_language_label: int = 2_000,
    italian_train_per_label: int = 4_000,
    italian_dev_per_label: int = 1_000,
    seed: int = 20260827,
    epochs: float = 2.0,
    max_length: int = 256,
) -> None:
    if action == "train-xlmr":
        if not controls or not benchmark:
            raise ValueError("train-xlmr requires controls and benchmark JSONL paths")
        exclusions = _wikipedia_exclusions(Path(controls), Path(benchmark))
        payload = train_xlmr.remote(
            model_id,
            train_per_language_label,
            dev_per_language_label,
            italian_train_per_label,
            italian_dev_per_label,
            json.dumps(exclusions, sort_keys=True),
            seed,
            epochs,
            max_length,
        )
        print(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True))
        return
    if action != "scan":
        raise ValueError("action must be train-xlmr or scan")
    if not run_id or not manifest or not output:
        raise ValueError("scan requires run-id, manifest, and output")
    requested = tuple(item.strip() for item in detectors.split(",") if item.strip())
    content = Path(manifest).read_text(encoding="utf-8")
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    payload = scan_open_detectors.remote(run_id, content, digest, requested, model_id)
    output_path = Path(output)
    for detector_id in requested:
        for name in ("results.jsonl", "run-manifest.json"):
            _download_file(
                f"/{run_id}/{detector_id}/{name}", output_path / detector_id / name
            )
    print(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True))


def _targeted_rows(
    stream: object, targets: dict[tuple[str, int], int], seed: int
) -> list[dict]:
    counts = {cell: 0 for cell in targets}
    rows = []
    shuffled = stream.shuffle(seed=seed, buffer_size=50_000)
    for example in shuffled:
        language = str(example.get("lang", "")).lower()
        label = int(example.get("label", -1))
        cell = (language, label)
        text = str(example.get("text", "")).strip()
        if cell not in counts or counts[cell] >= targets[cell] or len(text) < 200:
            continue
        rows.append({"text": text, "labels": label, "language": language})
        counts[cell] += 1
        if all(counts[cell] == targets[cell] for cell in targets):
            break
    if not all(counts[cell] == targets[cell] for cell in targets):
        raise RuntimeError(
            f"Could not fill targeted COLING cells: counts={counts}, targets={targets}"
        )
    return rows


def _wikipedia_human_rows(
    stream: object,
    requested: int,
    seed: int,
    excluded_article_ids: set[str],
) -> list[dict]:
    rows = []
    seen: set[str] = set()
    shuffled = stream.shuffle(seed=seed, buffer_size=50_000)
    for example in shuffled:
        article_id = str(example.get("id", ""))
        text = str(example.get("text", "")).strip()
        if (
            not article_id
            or article_id in excluded_article_ids
            or article_id in seen
            or len(text) < 800
        ):
            continue
        rows.append({"text": text, "labels": 0, "language": "it"})
        seen.add(article_id)
        if len(rows) == requested:
            break
    if len(rows) != requested:
        raise RuntimeError(
            f"Only found {len(rows)}/{requested} disjoint Italian Wikipedia rows"
        )
    return rows


def _cell_counts(rows: list[dict]) -> dict[str, int]:
    counts = {f"{language}:{label}": 0 for language in ("en", "it") for label in (0, 1)}
    for row in rows:
        counts[f"{row['language']}:{row['labels']}"] += 1
    return counts


def _wikipedia_exclusions(controls_path: Path, benchmark_path: Path) -> dict:
    from unmarker_text_bench.generic_detectors import read_jsonl

    article_ids: set[str] = set()
    for row in read_jsonl(controls_path):
        article_id = (row.get("source") or {}).get("article_id")
        if article_id:
            article_ids.add(str(article_id))
    for row in read_jsonl(benchmark_path):
        match = re.fullmatch(r"wikipedia-(?:en|it)-(.+)", str(row.get("sample_id")))
        if match:
            article_ids.add(match.group(1))
    return {
        "article_ids": sorted(article_ids),
        "sources": {
            "controls_sha256": hashlib.sha256(controls_path.read_bytes()).hexdigest(),
            "benchmark_sha256": hashlib.sha256(benchmark_path.read_bytes()).hexdigest(),
        },
    }


def _validate_identifier(value: str) -> None:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}", value):
        raise ValueError("Identifiers must contain 1-80 safe filename characters")


def _download_file(remote_path: str, local_path: Path) -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    with local_path.open("wb") as handle:
        for chunk in run_volume.read_file(remote_path):
            handle.write(chunk)
