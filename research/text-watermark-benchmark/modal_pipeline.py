from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import modal

PROJECT_ROOT = Path(__file__).resolve().parent
MARKLLM_COMMIT = "c45ddc40f7b761beabe55a1b8dc4690e531d1c6d"
GENERATION_MODEL = "Qwen/Qwen3-14B"
GENERATION_MODEL_REVISION = "40c069824f4251a91eefaf281ebe4c544efd3e18"
SCORER_MODEL = "Qwen/Qwen3-8B"
SCORER_MODEL_REVISION = "b968826d9c46dd6066d109eabc6255188de91218"
EMBEDDING_MODEL = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
EMBEDDING_MODEL_REVISION = "4328cf26390c98c5e3c738b4460a05b95f4911f5"
NLI_MODEL = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"
NLI_MODEL_REVISION = "8adb042d524ecd5c26d3e3ba0e3fbcf7e2d0864c"

REMOTE_PACKAGE_ROOT = "/opt/unmarker-src"
REMOTE_MARKLLM_ROOT = "/opt/MarkLLM"
RUNS_ROOT = Path("/runs")
HF_CACHE_ROOT = "/hf-cache"


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .uv_pip_install(
        "torch==2.13.0",
        "transformers==5.15.1",
        "sentence-transformers==6.0.0",
        "numpy==2.4.6",
        "scikit-learn==1.9.0",
        "tqdm==4.70.0",
        "accelerate==1.12.0",
        "gliner==0.2.24",
    )
    .run_commands(
        f"git clone https://github.com/THU-BPM/MarkLLM.git {REMOTE_MARKLLM_ROOT}",
        f"git -C {REMOTE_MARKLLM_ROOT} checkout {MARKLLM_COMMIT}",
    )
    .add_local_dir(
        PROJECT_ROOT / "src",
        remote_path=REMOTE_PACKAGE_ROOT,
        copy=True,
    )
    .env(
        {
            "HF_HOME": HF_CACHE_ROOT,
            "HF_HUB_ENABLE_HF_TRANSFER": "0",
            "TOKENIZERS_PARALLELISM": "false",
            "PYTHONPATH": REMOTE_PACKAGE_ROOT,
        }
    )
)

app = modal.App("unmarker-markllm-benchmark")
hf_cache = modal.Volume.from_name("unmarker-huggingface-cache", create_if_missing=True)
run_volume = modal.Volume.from_name("unmarker-markllm-runs", create_if_missing=True)
volumes = {HF_CACHE_ROOT: hf_cache, str(RUNS_ROOT): run_volume}


@app.function(
    image=image,
    gpu="L40S",
    timeout=86_400,
    retries=modal.Retries(max_retries=2, backoff_coefficient=2.0, initial_delay=5.0),
    volumes=volumes,
)
def generate_corpus(
    run_id: str,
    prompts_jsonl: str,
    allow_small_smoke: bool = False,
    algorithms: tuple[str, ...] = ("KGW", "Unigram", "SynthID", "EXP"),
    evidence_profile: str = "formal",
) -> dict:
    from unmarker_text_bench.markllm_backend import OfficialMarkLLMBackend
    from unmarker_text_bench.markllm_gate import (
        Gate2Config,
        MarkLLMGateRunner,
        load_prompts,
    )

    run_dir = _remote_run_dir(run_id)
    run_dir.mkdir(parents=True, exist_ok=True)
    prompts_path = run_dir / "prompts.jsonl"
    if (
        prompts_path.exists()
        and prompts_path.read_text(encoding="utf-8") != prompts_jsonl
    ):
        raise ValueError("This run id already contains a different prompt corpus")
    prompts_path.write_text(prompts_jsonl, encoding="utf-8")
    backend = OfficialMarkLLMBackend(
        markllm_root=Path(REMOTE_MARKLLM_ROOT),
        model_name=GENERATION_MODEL,
        model_revision=GENERATION_MODEL_REVISION,
        algorithms=algorithms,
        device="cuda",
        max_new_tokens=192,
        min_new_tokens=80,
        temperature=0.7,
        top_p=0.8,
        top_k=20,
        use_chat_template=True,
        enable_thinking=False,
        config_overrides={"EXP": {"sequence_length": 192}}
        if "EXP" in algorithms
        else None,
    )
    if evidence_profile == "gate2b_exp_pilot":
        minimum_calibration = 100
        minimum_evaluation = 50
    else:
        minimum_calibration = 100
        minimum_evaluation = 100
    runner = MarkLLMGateRunner(
        load_prompts(prompts_path),
        backend,
        Gate2Config(
            algorithms=algorithms,
            min_generated_tokens=80,
            allow_small_smoke=allow_small_smoke,
            min_calibration_prompts_per_language=minimum_calibration,
            min_evaluation_prompts_per_language=minimum_evaluation,
            evidence_profile=(
                "integration_smoke" if allow_small_smoke else evidence_profile
            ),
        ),
    )
    summary = runner.run(
        run_dir / "corpus",
        resume=True,
        checkpoint=run_volume.commit,
    )
    run_volume.commit()
    hf_cache.commit()
    return summary


@app.function(
    image=image,
    gpu="L40S",
    timeout=86_400,
    retries=modal.Retries(max_retries=2, backoff_coefficient=2.0, initial_delay=5.0),
    volumes=volumes,
)
def score_corpus(run_id: str) -> dict:
    from unmarker_text_bench.self_information import (
        CausalSelfInformationScorer,
        ScoringCorpusRunner,
    )

    run_dir = _remote_run_dir(run_id)
    generations = run_dir / "corpus" / "generations.jsonl"
    if not generations.exists():
        raise FileNotFoundError("Generate the MarkLLM corpus before scoring it")
    scorer = CausalSelfInformationScorer(
        SCORER_MODEL,
        SCORER_MODEL_REVISION,
        device="cuda",
    )
    summary = ScoringCorpusRunner(scorer).run(
        generations,
        run_dir / "scores" / "token-scores.jsonl",
        resume=True,
        checkpoint=run_volume.commit,
    )
    run_volume.commit()
    hf_cache.commit()
    return summary


@app.function(
    image=image,
    gpu="L40S",
    timeout=86_400,
    retries=modal.Retries(max_retries=2, backoff_coefficient=2.0, initial_delay=5.0),
    volumes=volumes,
)
def protect_sources(
    run_id: str,
    thresholds: dict[str, float],
    labels: tuple[str, ...],
    threshold_provenance: dict | None = None,
) -> dict:
    from unmarker_text_bench.protected_spans import (
        GlinerEntityExtractor,
        ProtectedSpanManifestRunner,
    )

    run_dir = _remote_run_dir(run_id)
    generations = run_dir / "corpus" / "generations.jsonl"
    if not generations.exists():
        raise FileNotFoundError(
            "Generate the MarkLLM corpus before extracting entities"
        )
    extractor = GlinerEntityExtractor(
        thresholds=thresholds,
        labels=labels,
        device="cuda",
    )
    output = run_dir / "protection" / "gliner-v1" / "protected-spans.jsonl"
    manifest = ProtectedSpanManifestRunner(extractor).run(
        generations,
        output,
        threshold_provenance=threshold_provenance,
    )
    run_volume.commit()
    hf_cache.commit()
    return manifest


@app.function(
    image=image,
    gpu="L40S",
    timeout=86_400,
    retries=modal.Retries(max_retries=2, backoff_coefficient=2.0, initial_delay=5.0),
    volumes=volumes,
)
def draft_ner_gold(
    run_id: str,
    samples_per_language: int = 50,
    private_source_jsonl: str = "",
) -> dict:
    from unmarker_text_bench.ner_gold import NerGoldDraftRunner
    from unmarker_text_bench.protected_spans import GlinerEntityExtractor

    run_dir = _remote_run_dir(run_id)
    generations = run_dir / "corpus" / "generations.jsonl"
    if not generations.exists() and not private_source_jsonl:
        raise FileNotFoundError("Generate the MarkLLM corpus before drafting NER gold")
    source_rows = [
        json.loads(line) for line in private_source_jsonl.splitlines() if line.strip()
    ]
    label_sets = {tuple(row.get("gold_label_set") or ()) for row in source_rows} - {()}
    if len(label_sets) > 1:
        raise ValueError("NER gold source rows must use one common entity label set")
    labels = next(iter(label_sets)) if label_sets else None
    extractor_kwargs = {
        "thresholds": {"en": 0.30, "it": 0.30},
        "device": "cuda",
    }
    if labels:
        extractor_kwargs["labels"] = labels
    extractor = GlinerEntityExtractor(**extractor_kwargs)
    source_is_approved = bool(source_rows) and all(
        row.get("review_status") == "approved" and str(row.get("reviewer", "")).strip()
        for row in source_rows
    )
    suffix = "approved" if source_is_approved else "pending"
    output = run_dir / "protection" / "gold" / f"ner-gold.{suffix}.jsonl"
    runner = NerGoldDraftRunner(extractor, samples_per_language)
    if private_source_jsonl:
        source_path = run_dir / "protection" / "gold" / "private-source.jsonl"
        source_path.parent.mkdir(parents=True, exist_ok=True)
        source_path.write_text(private_source_jsonl, encoding="utf-8")
        manifest = runner.run_source(source_path, output)
    else:
        manifest = runner.run(generations, output)
    run_volume.commit()
    hf_cache.commit()
    return manifest


@app.function(
    image=image,
    gpu="L40S",
    timeout=86_400,
    retries=modal.Retries(max_retries=2, backoff_coefficient=2.0, initial_delay=5.0),
    volumes=volumes,
)
def evaluate_candidates(
    run_id: str,
    quality_profile: str = "legacy-v1",
    evaluation_label: str = "",
    require_human_approved_ner: bool = False,
) -> dict:
    from unmarker_text_bench.markllm_backend import OfficialMarkLLMDetectorBackend
    from unmarker_text_bench.protected_spans import (
        GlinerEntityExtractor,
        ProtectedSpanIndex,
    )
    from unmarker_text_bench.remote_evaluation import (
        CandidateEvaluationRunner,
        NeuralQualityEvaluator,
    )

    run_dir = _remote_run_dir(run_id)
    generations = run_dir / "corpus" / "generations.jsonl"
    candidates = run_dir / "attacks" / "evaluation-inputs.jsonl"
    if not generations.exists() or not candidates.exists():
        raise FileNotFoundError(
            "Both corpus generations and uploaded evaluation inputs are required"
        )
    algorithms = tuple(
        sorted(
            {
                str(row["algorithm"])
                for row in _read_jsonl(generations)
                if row["split"] == "evaluation"
            }
        )
    )
    detector = OfficialMarkLLMDetectorBackend(
        markllm_root=Path(REMOTE_MARKLLM_ROOT),
        tokenizer_name=GENERATION_MODEL,
        tokenizer_revision=GENERATION_MODEL_REVISION,
        algorithms=algorithms,
        device="cuda",
        config_overrides={"EXP": {"sequence_length": 192}}
        if "EXP" in algorithms
        else None,
    )
    quality = NeuralQualityEvaluator(
        embedding_model=EMBEDDING_MODEL,
        embedding_revision=EMBEDDING_MODEL_REVISION,
        nli_model=NLI_MODEL,
        nli_revision=NLI_MODEL_REVISION,
        device="cuda",
        batch_size=32,
    )
    protected_spans = None
    entity_extractor = None
    if quality_profile == "gliner-v1":
        protected_path = run_dir / "protection" / "gliner-v1" / "protected-spans.jsonl"
        if not protected_path.exists():
            raise FileNotFoundError(
                "Run the Modal protect stage before gliner-v1 evaluation"
            )
        protected_spans = ProtectedSpanIndex.load(protected_path)
        if require_human_approved_ner and not protected_spans.metadata.get(
            "threshold_provenance", {}
        ).get("human_approved"):
            raise ValueError(
                "This evidence profile requires human-approved GLiNER thresholds"
            )
        thresholds = protected_spans.metadata.get("extractor", {}).get("thresholds")
        if not thresholds:
            raise ValueError("Protected-span manifest has no GLiNER thresholds")
        labels = protected_spans.metadata.get("extractor", {}).get("labels")
        if not labels:
            raise ValueError("Protected-span manifest has no GLiNER label set")
        entity_extractor = GlinerEntityExtractor(
            thresholds=thresholds,
            labels=tuple(labels),
            device="cuda",
        )
    elif quality_profile != "legacy-v1":
        raise ValueError("quality_profile must be legacy-v1 or gliner-v1")
    resolved_label = evaluation_label or quality_profile
    _validate_artifact_label(resolved_label)
    summary = CandidateEvaluationRunner(
        detector,
        quality,
        protected_spans=protected_spans,
        entity_extractor=entity_extractor,
    ).run(
        generations,
        candidates,
        run_dir / "evaluation" / resolved_label / "candidate-evaluations.jsonl",
        resume=True,
        checkpoint=run_volume.commit,
    )
    run_volume.commit()
    hf_cache.commit()
    return summary


@app.local_entrypoint()
def main(
    stage: str,
    run_id: str,
    prompts: str = str(PROJECT_ROOT / "datasets" / "markllm-wikipedia-v1.jsonl"),
    candidates: str = "",
    output: str = "",
    allow_small_smoke: bool = False,
    algorithms: str = "KGW,Unigram,SynthID,EXP",
    prompts_per_cell: int = 0,
    calibration_prompts_per_language: int = 0,
    evaluation_prompts_per_language: int = 0,
    quality_profile: str = "legacy-v1",
    gliner_thresholds: str = "",
    gold_set: str = "",
    gold_samples_per_language: int = 50,
    evaluation_label: str = "",
    evidence_profile: str = "formal",
    gold_source: str = "",
) -> None:
    """Run a benchmark stage from a Modal-authenticated machine."""

    _validate_run_id(run_id)
    output_dir = (
        Path(output) if output else PROJECT_ROOT / "results" / f"modal-{run_id}"
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    if evidence_profile not in {"formal", "gate2b_exp_pilot"}:
        raise ValueError("evidence_profile must be formal or gate2b_exp_pilot")
    if stage in {"evaluate", "download"}:
        _validate_artifact_label(evaluation_label or quality_profile)
    if stage == "prepare":
        selected_algorithms = tuple(
            value.strip() for value in algorithms.split(",") if value.strip()
        )
        if not selected_algorithms:
            raise ValueError("--algorithms must contain at least one MarkLLM algorithm")
        prompt_text = Path(prompts).read_text(encoding="utf-8")
        if prompts_per_cell and (
            calibration_prompts_per_language or evaluation_prompts_per_language
        ):
            raise ValueError(
                "Use --prompts-per-cell or the two split-specific limits, not both"
            )
        if prompts_per_cell:
            if prompts_per_cell < 1:
                raise ValueError("--prompts-per-cell must be at least 1")
            if not allow_small_smoke:
                raise ValueError(
                    "--prompts-per-cell is an integration-only option; also pass "
                    "--allow-small-smoke"
                )
            prompt_text = _limit_prompts_per_cell(prompt_text, prompts_per_cell)
        elif calibration_prompts_per_language or evaluation_prompts_per_language:
            if not (
                calibration_prompts_per_language > 0
                and evaluation_prompts_per_language > 0
            ):
                raise ValueError("Both split-specific prompt limits must be positive")
            prompt_text = _limit_prompts_by_split(
                prompt_text,
                calibration_prompts_per_language,
                evaluation_prompts_per_language,
            )
        if evidence_profile == "gate2b_exp_pilot":
            if selected_algorithms != ("EXP",):
                raise ValueError("gate2b_exp_pilot requires --algorithms EXP")
            if (
                calibration_prompts_per_language != 100
                or evaluation_prompts_per_language != 50
            ):
                raise ValueError(
                    "gate2b_exp_pilot requires 100 calibration and 50 evaluation "
                    "prompts per language"
                )
            if allow_small_smoke:
                raise ValueError("gate2b_exp_pilot is not an integration smoke")
        print(
            json.dumps(
                generate_corpus.remote(
                    run_id,
                    prompt_text,
                    allow_small_smoke,
                    selected_algorithms,
                    evidence_profile,
                ),
                indent=2,
            )
        )
        print(json.dumps(score_corpus.remote(run_id), indent=2))
        _download_prepare_artifacts(run_id, output_dir)
    elif stage == "protect":
        thresholds, labels, provenance = _load_gliner_thresholds(gliner_thresholds)
        if evidence_profile == "gate2b_exp_pilot" and not provenance.get(
            "human_approved"
        ):
            raise ValueError(
                "gate2b_exp_pilot requires human-approved GLiNER thresholds"
            )
        print(
            json.dumps(
                protect_sources.remote(run_id, thresholds, labels, provenance), indent=2
            )
        )
        _download_protection_artifacts(run_id, output_dir)
    elif stage in {"ner-draft", "ner-public-gold"}:
        if stage == "ner-public-gold":
            if gold_source:
                raise ValueError("ner-public-gold does not accept --gold-source")
            from unmarker_text_bench.ner_gold import PublicNerGoldSourceBuilder

            source_path = output_dir / "public-gold-source.approved.jsonl"
            source_manifest = PublicNerGoldSourceBuilder(
                gold_samples_per_language
            ).download_and_run(source_path)
            print(json.dumps(source_manifest, indent=2))
            gold_source = str(source_path)
        private_source_jsonl = (
            Path(gold_source).read_text(encoding="utf-8") if gold_source else ""
        )
        manifest = draft_ner_gold.remote(
            run_id,
            gold_samples_per_language,
            private_source_jsonl,
        )
        print(json.dumps(manifest, indent=2))
        suffix = "approved" if manifest.get("human_approved") else "pending"
        _download_ner_gold_artifacts(run_id, output_dir, suffix)
    elif stage == "ner-calibrate":
        if not gold_set:
            raise ValueError("--gold-set is required for ner-calibrate")
        from unmarker_text_bench.ner_gold import NerThresholdCalibrator

        payload = NerThresholdCalibrator().run(
            Path(gold_set), output_dir / "gliner-thresholds.json"
        )
        print(json.dumps(payload, indent=2))
    elif stage == "evaluate":
        if not candidates:
            raise ValueError("--candidates is required for the evaluate stage")
        with run_volume.batch_upload(force=True) as upload:
            upload.put_file(candidates, f"/{run_id}/attacks/evaluation-inputs.jsonl")
        print(
            json.dumps(
                evaluate_candidates.remote(
                    run_id,
                    quality_profile,
                    evaluation_label,
                    evidence_profile == "gate2b_exp_pilot",
                ),
                indent=2,
            )
        )
        resolved_label = evaluation_label or quality_profile
        _validate_artifact_label(resolved_label)
        evaluation_root = f"/{run_id}/evaluation/{resolved_label}"
        _download_file(
            f"{evaluation_root}/candidate-evaluations.jsonl",
            output_dir / "candidate-evaluations.jsonl",
        )
        _download_file(
            f"{evaluation_root}/candidate-evaluations.manifest.json",
            output_dir / "candidate-evaluations.manifest.json",
        )
    elif stage == "download":
        _download_prepare_artifacts(run_id, output_dir)
        try:
            _download_protection_artifacts(run_id, output_dir)
        except FileNotFoundError:
            pass
        for remote_name, local_name in (
            (
                f"evaluation/{evaluation_label or quality_profile}/candidate-evaluations.jsonl",
                "candidate-evaluations.jsonl",
            ),
            (
                f"evaluation/{evaluation_label or quality_profile}/candidate-evaluations.manifest.json",
                "candidate-evaluations.manifest.json",
            ),
        ):
            try:
                _download_file(f"/{run_id}/{remote_name}", output_dir / local_name)
            except FileNotFoundError:
                pass
    else:
        raise ValueError(
            "stage must be one of: prepare, ner-draft, ner-public-gold, "
            "ner-calibrate, protect, evaluate, download"
        )
    print(f"Artifacts downloaded to {output_dir.resolve()}")


def _remote_run_dir(run_id: str) -> Path:
    _validate_run_id(run_id)
    return RUNS_ROOT / run_id


def _validate_run_id(run_id: str) -> None:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}", run_id):
        raise ValueError("run_id must be 1-80 safe filename characters")


def _validate_artifact_label(label: str) -> None:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}", label):
        raise ValueError("evaluation_label must be 1-80 safe filename characters")


def _download_prepare_artifacts(run_id: str, output_dir: Path) -> None:
    for remote_name, local_name in (
        ("corpus/generations.jsonl", "generations.jsonl"),
        ("corpus/summary.json", "corpus-summary.json"),
        ("corpus/config.json", "corpus-config.json"),
        ("corpus/input-manifest.json", "corpus-input-manifest.json"),
        ("scores/token-scores.jsonl", "token-scores.jsonl"),
        ("scores/token-scores.manifest.json", "token-scores.manifest.json"),
    ):
        _download_file(f"/{run_id}/{remote_name}", output_dir / local_name)


def _download_protection_artifacts(run_id: str, output_dir: Path) -> None:
    for remote_name, local_name in (
        ("protection/gliner-v1/protected-spans.jsonl", "protected-spans.jsonl"),
        (
            "protection/gliner-v1/protected-spans.manifest.json",
            "protected-spans.manifest.json",
        ),
    ):
        _download_file(f"/{run_id}/{remote_name}", output_dir / local_name)


def _download_ner_gold_artifacts(
    run_id: str, output_dir: Path, suffix: str = "pending"
) -> None:
    for remote_name, local_name in (
        (f"protection/gold/ner-gold.{suffix}.jsonl", f"ner-gold.{suffix}.jsonl"),
        (
            f"protection/gold/ner-gold.{suffix}.manifest.json",
            f"ner-gold.{suffix}.manifest.json",
        ),
    ):
        _download_file(f"/{run_id}/{remote_name}", output_dir / local_name)


def _download_file(remote_path: str, local_path: Path) -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        chunks = run_volume.read_file(remote_path)
        with local_path.open("wb") as handle:
            for chunk in chunks:
                handle.write(chunk)
    except Exception as error:
        if error.__class__.__name__ in {"NotFoundError", "FileNotFoundError"}:
            raise FileNotFoundError(remote_path) from error
        raise


def _read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _limit_prompts_per_cell(prompts_jsonl: str, limit: int) -> str:
    counts: dict[tuple[str, str], int] = {}
    selected = []
    for line_number, line in enumerate(prompts_jsonl.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
            cell = (str(row["language"]), str(row["split"]))
        except (json.JSONDecodeError, KeyError) as error:
            raise ValueError(f"Invalid prompt JSONL at line {line_number}") from error
        if counts.get(cell, 0) >= limit:
            continue
        selected.append(row)
        counts[cell] = counts.get(cell, 0) + 1
    required = {
        (language, split)
        for language in ("en", "it")
        for split in ("calibration", "evaluation")
    }
    missing = sorted(required - set(counts))
    if missing:
        raise ValueError(f"Prompt subset is missing language/split cells: {missing}")
    return "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in selected)


def _limit_prompts_by_split(
    prompts_jsonl: str,
    calibration_limit: int,
    evaluation_limit: int,
) -> str:
    limits = {"calibration": calibration_limit, "evaluation": evaluation_limit}
    counts: dict[tuple[str, str], int] = {}
    selected = []
    for line_number, line in enumerate(prompts_jsonl.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
            cell = (str(row["language"]), str(row["split"]))
        except (json.JSONDecodeError, KeyError) as error:
            raise ValueError(f"Invalid prompt JSONL at line {line_number}") from error
        if cell[1] not in limits or counts.get(cell, 0) >= limits[cell[1]]:
            continue
        selected.append(row)
        counts[cell] = counts.get(cell, 0) + 1
    required = {
        (language, split): limits[split]
        for language in ("en", "it")
        for split in ("calibration", "evaluation")
    }
    incomplete = {
        str(cell): {"expected": count, "actual": counts.get(cell, 0)}
        for cell, count in required.items()
        if counts.get(cell, 0) != count
    }
    if incomplete:
        raise ValueError(f"Prompt subset is incomplete: {incomplete}")
    return "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in selected)


def _load_gliner_thresholds(
    path: str,
) -> tuple[dict[str, float], tuple[str, ...], dict]:
    from unmarker_text_bench.protected_spans import GLINER_LABELS

    if not path:
        return (
            {"en": 0.5, "it": 0.5},
            GLINER_LABELS,
            {"human_approved": False, "status": "uncalibrated_default"},
        )
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    thresholds = payload.get("thresholds", payload)
    if set(thresholds) != {"en", "it"}:
        raise ValueError("GLiNER thresholds must contain exactly en and it")
    labels = tuple(payload.get("labels") or GLINER_LABELS)
    if not labels or len(labels) != len(set(labels)):
        raise ValueError("GLiNER labels must be non-empty and unique")
    provenance = {
        "human_approved": bool(payload.get("human_approved", False)),
        "status": str(payload.get("status", "external_threshold_file")),
        "threshold_file_sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
        "reviewed_gold_sha256": payload.get("reviewed_gold_sha256"),
        "labels": list(labels),
        "reviewers": payload.get("reviewers", []),
        "gold_provenance": payload.get("gold_provenance", []),
    }
    return (
        {language: float(value) for language, value in thresholds.items()},
        labels,
        provenance,
    )
