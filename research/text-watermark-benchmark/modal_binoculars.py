from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

import modal

PROJECT_ROOT = Path(__file__).resolve().parent
REMOTE_PACKAGE_ROOT = "/opt/unmarker-src"
REMOTE_BINOCULARS_ROOT = "/opt/Binoculars"
RUNS_ROOT = Path("/generic-runs")
HF_CACHE_ROOT = "/hf-cache"

BINOCULARS_COMMIT = "c8ae2f90d50ee696418bc71d8d9e5020e5f9d7b8"
OBSERVER_MODEL = "tiiuae/falcon-7b"
OBSERVER_REVISION = "ec89142b67d748a1865ea4451372db8313ada0d8"
PERFORMER_MODEL = "tiiuae/falcon-7b-instruct"
PERFORMER_REVISION = "8782b5c5d8c9290412416618f36a133653e85285"
MODEL_VERSION = (
    f"official-binoculars@{BINOCULARS_COMMIT[:12]}:"
    f"falcon-7b@{OBSERVER_REVISION[:12]}:"
    f"falcon-7b-instruct@{PERFORMER_REVISION[:12]}"
)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .uv_pip_install(
        "torch==2.4.1",
        "transformers==4.31.0",
        "accelerate==0.21.0",
        "sentencepiece==0.2.0",
        "numpy==1.26.4",
        "huggingface-hub==0.24.7",
    )
    .run_commands(
        f"git clone https://github.com/ahans30/Binoculars.git {REMOTE_BINOCULARS_ROOT}",
        f"git -C {REMOTE_BINOCULARS_ROOT} checkout {BINOCULARS_COMMIT}",
    )
    .add_local_dir(PROJECT_ROOT / "src", remote_path=REMOTE_PACKAGE_ROOT, copy=True)
    .env(
        {
            "HF_HOME": HF_CACHE_ROOT,
            "HF_HUB_ENABLE_HF_TRANSFER": "0",
            "TOKENIZERS_PARALLELISM": "false",
            "PYTHONPATH": f"{REMOTE_PACKAGE_ROOT}:{REMOTE_BINOCULARS_ROOT}",
        }
    )
)

app = modal.App("unmarker-generic-binoculars")
hf_cache = modal.Volume.from_name("unmarker-huggingface-cache", create_if_missing=True)
run_volume = modal.Volume.from_name(
    "unmarker-generic-detector-runs", create_if_missing=True
)
volumes = {HF_CACHE_ROOT: hf_cache, str(RUNS_ROOT): run_volume}


@app.function(
    image=image,
    gpu="L40S",
    timeout=86_400,
    retries=modal.Retries(max_retries=2, backoff_coefficient=2.0, initial_delay=5.0),
    volumes=volumes,
)
def scan_binoculars(
    run_id: str,
    documents_jsonl: str,
    documents_sha256: str,
    mode: str = "low-fpr",
    batch_size: int = 4,
) -> dict:
    import torch
    from binoculars import Binoculars
    from huggingface_hub import snapshot_download

    from unmarker_text_bench.generic_detectors import (
        DetectionRunner,
        binoculars_result,
        read_jsonl,
        write_json,
        write_jsonl,
    )

    _validate_run_id(run_id)
    if mode not in {"low-fpr", "accuracy"}:
        raise ValueError("mode must be low-fpr or accuracy")
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    if hashlib.sha256(documents_jsonl.encode("utf-8")).hexdigest() != documents_sha256:
        raise ValueError("Local corpus hash does not match uploaded content")

    run_dir = RUNS_ROOT / run_id / "binoculars"
    run_dir.mkdir(parents=True, exist_ok=True)
    documents_path = run_dir / "documents.jsonl"
    if (
        documents_path.exists()
        and documents_path.read_text(encoding="utf-8") != documents_jsonl
    ):
        raise ValueError("This run ID already contains a different detector corpus")
    documents_path.write_text(documents_jsonl, encoding="utf-8")
    documents = read_jsonl(documents_path)
    DetectionRunner._validate_documents(documents)

    checkpoint_path = run_dir / "checkpoint.jsonl"
    existing = read_jsonl(checkpoint_path) if checkpoint_path.exists() else []
    latest = {str(row["document_id"]): row for row in existing}
    pending = [
        row
        for row in documents
        if latest.get(str(row["document_id"]), {}).get("status") != "success"
    ]
    if pending:
        observer_path = snapshot_download(
            OBSERVER_MODEL, revision=OBSERVER_REVISION, cache_dir=HF_CACHE_ROOT
        )
        performer_path = snapshot_download(
            PERFORMER_MODEL, revision=PERFORMER_REVISION, cache_dir=HF_CACHE_ROOT
        )
        detector = Binoculars(
            observer_name_or_path=observer_path,
            performer_name_or_path=performer_path,
            use_bfloat16=True,
            max_token_observed=512,
            mode=mode,
        )
        threshold = float(detector.threshold)
        offset = 0
        active_batch_size = batch_size
        batches_since_commit = 0
        while offset < len(pending):
            batch = pending[offset : offset + active_batch_size]
            started = time.perf_counter()
            try:
                scores = detector.compute_score([str(row["text"]) for row in batch])
            except torch.cuda.OutOfMemoryError:
                torch.cuda.empty_cache()
                if active_batch_size == 1:
                    raise
                active_batch_size = max(1, active_batch_size // 2)
                continue
            elapsed_ms = (time.perf_counter() - started) * 1000
            if isinstance(scores, float):
                scores = [scores]
            for document, score in zip(batch, scores, strict=True):
                result = binoculars_result(
                    document,
                    score=float(score),
                    threshold=threshold,
                    latency_ms=elapsed_ms / len(batch),
                    model_version=MODEL_VERSION,
                )
                with checkpoint_path.open("a", encoding="utf-8") as handle:
                    handle.write(
                        json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n"
                    )
                latest[str(document["document_id"])] = result
            offset += len(batch)
            batches_since_commit += 1
            if batches_since_commit >= 10:
                run_volume.commit()
                batches_since_commit = 0
        del detector
        torch.cuda.empty_cache()
        hf_cache.commit()
    else:
        threshold = 0.8536432310785527 if mode == "low-fpr" else 0.9015310749276843

    canonical = [latest[str(row["document_id"])] for row in documents]
    results_path = run_dir / "results.jsonl"
    write_jsonl(results_path, canonical)
    summary = {
        "detector_id": "binoculars",
        "requested": len(documents),
        "succeeded": len(canonical),
        "failed": 0,
        "resumed": len(documents) - len(pending),
        "output_path": str(results_path),
        "effective_batch_size": active_batch_size if pending else batch_size,
    }
    write_json(
        run_dir / "run-manifest.json",
        {
            "artifact_schema_version": 1,
            "artifact_kind": "generic-detector-run-manifest",
            "detector_id": "binoculars",
            "documents_sha256": documents_sha256,
            "document_count": len(documents),
            "detector": {
                "implementation": "official ahans30/Binoculars",
                "source_commit": BINOCULARS_COMMIT,
                "observer_model": OBSERVER_MODEL,
                "observer_revision": OBSERVER_REVISION,
                "performer_model": PERFORMER_MODEL,
                "performer_revision": PERFORMER_REVISION,
                "mode": mode,
                "threshold": threshold,
                "max_token_observed": 512,
                "score_definition": "perplexity_over_cross_perplexity; lower_is_more_AI",
                "calibration_status": (
                    "official-global-threshold-unvalidated-for-italian-and-this-corpus"
                ),
            },
            "summary": summary,
        },
    )
    run_volume.commit()
    return summary


@app.local_entrypoint()
def main(
    run_id: str,
    manifest: str,
    output: str,
    mode: str = "low-fpr",
    batch_size: int = 4,
) -> None:
    documents_path = Path(manifest)
    output_dir = Path(output) / "binoculars"
    content = documents_path.read_text(encoding="utf-8")
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    summary = scan_binoculars.remote(run_id, content, digest, mode, batch_size)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name in ("results.jsonl", "run-manifest.json"):
        _download_file(f"/{run_id}/binoculars/{name}", output_dir / name)
    print(json.dumps(summary, indent=2, ensure_ascii=False, sort_keys=True))
    print(f"Artifacts downloaded to {output_dir.resolve()}")


def _validate_run_id(run_id: str) -> None:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}", run_id):
        raise ValueError("run_id must be 1-80 safe filename characters")


def _download_file(remote_path: str, local_path: Path) -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    chunks = run_volume.read_file(remote_path)
    with local_path.open("wb") as handle:
        for chunk in chunks:
            handle.write(chunk)
