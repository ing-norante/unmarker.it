from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

import modal

PROJECT_ROOT = Path(__file__).resolve().parent
REMOTE_PACKAGE_ROOT = "/opt/unmarker-src"
REMOTE_FAST_DETECT_ROOT = "/opt/fast-detect-gpt"
HF_CACHE_ROOT = "/hf-cache"
RUNS_ROOT = Path("/generic-runs")

FAST_DETECT_COMMIT = "971b05202bac2bb504d60c0ac0812fea7a8f7c82"
REFERENCE_MODEL = "EleutherAI/gpt-j-6b"
REFERENCE_REVISION = "47e169305d2e8376be1d31e765533382721b2cc1"
SCORING_MODEL = "EleutherAI/gpt-neo-2.7B"
SCORING_REVISION = "e24fa291132763e59f4a5422741b424fb5d59056"
MODEL_VERSION = (
    f"official-fast-detect-gpt@{FAST_DETECT_COMMIT[:12]}:"
    f"gpt-j-6b@{REFERENCE_REVISION[:12]}:"
    f"gpt-neo-2.7b@{SCORING_REVISION[:12]}"
)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .uv_pip_install(
        "torch==2.5.1",
        "transformers==4.46.3",
        "accelerate==1.1.1",
        "scipy==1.14.1",
        "numpy==1.26.4",
        "tqdm==4.67.1",
        "huggingface-hub==0.26.2",
    )
    .run_commands(
        f"git clone https://github.com/baoguangsheng/fast-detect-gpt.git {REMOTE_FAST_DETECT_ROOT}",
        f"git -C {REMOTE_FAST_DETECT_ROOT} checkout {FAST_DETECT_COMMIT}",
    )
    .add_local_dir(PROJECT_ROOT / "src", remote_path=REMOTE_PACKAGE_ROOT, copy=True)
    .env(
        {
            "HF_HOME": HF_CACHE_ROOT,
            "HF_HUB_ENABLE_HF_TRANSFER": "0",
            "TOKENIZERS_PARALLELISM": "false",
            "PYTHONPATH": (f"{REMOTE_PACKAGE_ROOT}:{REMOTE_FAST_DETECT_ROOT}/scripts"),
        }
    )
)

app = modal.App("unmarker-fast-detect-gpt")
hf_cache = modal.Volume.from_name("unmarker-huggingface-cache", create_if_missing=True)
run_volume = modal.Volume.from_name(
    "unmarker-generic-detector-runs", create_if_missing=True
)
volumes = {HF_CACHE_ROOT: hf_cache, str(RUNS_ROOT): run_volume}


@app.function(
    image=image,
    gpu="L40S",
    cpu=4,
    memory=49_152,
    timeout=86_400,
    retries=modal.Retries(max_retries=2, backoff_coefficient=2.0, initial_delay=5.0),
    volumes=volumes,
)
def scan_fast_detect_gpt(
    run_id: str,
    documents_jsonl: str,
    documents_sha256: str,
    max_length: int = 512,
) -> dict:
    import torch
    from baselines import get_logrank
    from fast_detect_gpt import get_sampling_discrepancy_analytic
    from huggingface_hub import snapshot_download
    from scipy.stats import norm
    from transformers import AutoModelForCausalLM, AutoTokenizer

    from unmarker_text_bench.generic_detectors import (
        DetectionRunner,
        read_jsonl,
        utc_now,
        write_json,
        write_jsonl,
    )

    _validate_run_id(run_id)
    if max_length < 32:
        raise ValueError("max_length must be at least 32")
    if hashlib.sha256(documents_jsonl.encode("utf-8")).hexdigest() != documents_sha256:
        raise ValueError("Local corpus hash does not match uploaded content")
    root = RUNS_ROOT / run_id
    root.mkdir(parents=True, exist_ok=True)
    documents_path = root / "documents.jsonl"
    if (
        documents_path.exists()
        and documents_path.read_text(encoding="utf-8") != documents_jsonl
    ):
        raise ValueError("This run ID already contains a different detector corpus")
    documents_path.write_text(documents_jsonl, encoding="utf-8")
    documents = read_jsonl(documents_path)
    DetectionRunner._validate_documents(documents)

    states = {}
    for detector_id in ("fast_detect_gpt", "logrank"):
        detector_dir = root / detector_id
        detector_dir.mkdir(parents=True, exist_ok=True)
        checkpoint = detector_dir / "checkpoint.jsonl"
        rows = read_jsonl(checkpoint) if checkpoint.exists() else []
        states[detector_id] = {
            "dir": detector_dir,
            "checkpoint": checkpoint,
            "latest": {str(row["document_id"]): row for row in rows},
        }
    pending = [
        document
        for document in documents
        if any(
            states[detector]["latest"]
            .get(str(document["document_id"]), {})
            .get("status")
            != "success"
            for detector in states
        )
    ]
    if pending:
        reference_path = snapshot_download(
            REFERENCE_MODEL, revision=REFERENCE_REVISION, cache_dir=HF_CACHE_ROOT
        )
        scoring_path = snapshot_download(
            SCORING_MODEL, revision=SCORING_REVISION, cache_dir=HF_CACHE_ROOT
        )
        reference_tokenizer = AutoTokenizer.from_pretrained(reference_path)
        scoring_tokenizer = AutoTokenizer.from_pretrained(scoring_path)
        reference_model = (
            AutoModelForCausalLM.from_pretrained(
                reference_path, torch_dtype=torch.float16, low_cpu_mem_usage=True
            )
            .to("cuda")
            .eval()
        )
        scoring_model = (
            AutoModelForCausalLM.from_pretrained(
                scoring_path, torch_dtype=torch.float16, low_cpu_mem_usage=True
            )
            .to("cuda")
            .eval()
        )
        completed_since_commit = 0
        for document in pending:
            started = time.perf_counter()
            scoring_tokens = scoring_tokenizer(
                str(document["text"]),
                return_tensors="pt",
                truncation=True,
                max_length=max_length,
            ).to("cuda")
            reference_tokens = reference_tokenizer(
                str(document["text"]),
                return_tensors="pt",
                truncation=True,
                max_length=max_length,
            ).to("cuda")
            if not torch.equal(scoring_tokens.input_ids, reference_tokens.input_ids):
                raise ValueError(
                    "Official GPT-J/GPT-Neo tokenizers produced different IDs"
                )
            labels = scoring_tokens.input_ids[:, 1:]
            with torch.inference_mode():
                scoring_logits = scoring_model(**scoring_tokens).logits[:, :-1]
                reference_logits = reference_model(**reference_tokens).logits[:, :-1]
                criterion = float(
                    get_sampling_discrepancy_analytic(
                        reference_logits, scoring_logits, labels
                    )
                )
                logrank = float(get_logrank(scoring_logits, labels))
            probability = _official_probability(criterion, norm)
            elapsed_ms = (time.perf_counter() - started) * 1000
            common_raw = {
                "input_token_count": int(scoring_tokens.input_ids.shape[-1]),
                "truncated": int(scoring_tokens.input_ids.shape[-1]) >= max_length,
                "max_length": max_length,
            }
            fast_result = _result(
                document,
                detector_id="fast_detect_gpt",
                score=criterion,
                score_name="sampling_discrepancy_analytic",
                native_ai_detected=probability >= 0.5,
                native_label="AI" if probability >= 0.5 else "HUMAN",
                latency_ms=elapsed_ms,
                raw_response={
                    **common_raw,
                    "criterion": criterion,
                    "official_probability": probability,
                    "official_probability_threshold": 0.5,
                },
            )
            logrank_result = _result(
                document,
                detector_id="logrank",
                score=logrank,
                score_name="negative_mean_log_rank",
                native_ai_detected=None,
                native_label="UNAVAILABLE_UNTIL_CALIBRATED",
                latency_ms=elapsed_ms,
                raw_response={**common_raw, "logrank": logrank},
            )
            for detector_id, result in (
                ("fast_detect_gpt", fast_result),
                ("logrank", logrank_result),
            ):
                state = states[detector_id]
                if (
                    state["latest"].get(str(document["document_id"]), {}).get("status")
                    == "success"
                ):
                    continue
                with state["checkpoint"].open("a", encoding="utf-8") as handle:
                    handle.write(
                        json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n"
                    )
                state["latest"][str(document["document_id"])] = result
            completed_since_commit += 1
            if completed_since_commit >= 25:
                run_volume.commit()
                completed_since_commit = 0
        del reference_model, scoring_model
        torch.cuda.empty_cache()
        hf_cache.commit()

    summaries = []
    for detector_id, state in states.items():
        canonical = [state["latest"][str(row["document_id"])] for row in documents]
        results_path = state["dir"] / "results.jsonl"
        write_jsonl(results_path, canonical)
        summary = {
            "detector_id": detector_id,
            "requested": len(documents),
            "succeeded": len(canonical),
            "failed": 0,
            "resumed": len(documents) - len(pending),
            "output_path": str(results_path),
        }
        write_json(
            state["dir"] / "run-manifest.json",
            {
                "artifact_schema_version": 1,
                "artifact_kind": "generic-detector-run-manifest",
                "detector_id": detector_id,
                "created_at": utc_now(),
                "documents_sha256": documents_sha256,
                "document_count": len(documents),
                "detector": {
                    "implementation": "official baoguangsheng/fast-detect-gpt function",
                    "source_commit": FAST_DETECT_COMMIT,
                    "reference_model": REFERENCE_MODEL,
                    "reference_revision": REFERENCE_REVISION,
                    "scoring_model": SCORING_MODEL,
                    "scoring_revision": SCORING_REVISION,
                    "max_length": max_length,
                    "score_direction": "higher_is_ai",
                    "calibration_status": (
                        "official-normal-mixture-native-label-plus-local-controls-required"
                        if detector_id == "fast_detect_gpt"
                        else "no-native-threshold-local-controls-required"
                    ),
                },
                "summary": summary,
            },
        )
        summaries.append(summary)
    run_volume.commit()
    return {"runs": summaries}


@app.local_entrypoint()
def main(
    run_id: str,
    manifest: str,
    output: str,
    max_length: int = 512,
) -> None:
    content = Path(manifest).read_text(encoding="utf-8")
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    payload = scan_fast_detect_gpt.remote(run_id, content, digest, max_length)
    output_path = Path(output)
    for detector_id in ("fast_detect_gpt", "logrank"):
        for name in ("results.jsonl", "run-manifest.json"):
            _download_file(
                f"/{run_id}/{detector_id}/{name}", output_path / detector_id / name
            )
    print(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True))


def _official_probability(criterion: float, norm: object) -> float:
    human_density = float(norm.pdf(criterion, loc=0.2713, scale=0.9366))
    ai_density = float(norm.pdf(criterion, loc=2.2334, scale=1.8731))
    denominator = human_density + ai_density
    return ai_density / denominator if denominator else 0.5


def _result(
    document: dict,
    *,
    detector_id: str,
    score: float,
    score_name: str,
    native_ai_detected: bool | None,
    native_label: str,
    latency_ms: float,
    raw_response: dict,
) -> dict:
    from unmarker_text_bench.generic_detectors import utc_now

    return {
        "artifact_schema_version": 1,
        "artifact_kind": "unmarker-generic-detector-result",
        "detector_id": detector_id,
        "document_id": document["document_id"],
        "text_sha256": document["text_sha256"],
        "language": document["language"],
        "role": document["role"],
        "sample_id": document["sample_id"],
        "pipeline": document["pipeline"],
        "completed_at": utc_now(),
        "status": "success",
        "score": float(score),
        "score_name": score_name,
        "score_direction": "higher_is_ai",
        "native_ai_detected": native_ai_detected,
        "native_label": native_label,
        "model_version": MODEL_VERSION,
        "request_id": None,
        "attempt_count": 1,
        "latency_ms": latency_ms,
        "billable_units": None,
        "raw_response": raw_response,
    }


def _validate_run_id(run_id: str) -> None:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}", run_id):
        raise ValueError("run_id must be 1-80 safe filename characters")


def _download_file(remote_path: str, local_path: Path) -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    with local_path.open("wb") as handle:
        for chunk in run_volume.read_file(remote_path):
            handle.write(chunk)
