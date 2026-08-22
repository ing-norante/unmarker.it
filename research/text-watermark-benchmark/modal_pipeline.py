from __future__ import annotations

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
    runner = MarkLLMGateRunner(
        load_prompts(prompts_path),
        backend,
        Gate2Config(
            algorithms=algorithms,
            min_generated_tokens=80,
            allow_small_smoke=allow_small_smoke,
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
def evaluate_candidates(run_id: str) -> dict:
    from unmarker_text_bench.markllm_backend import OfficialMarkLLMDetectorBackend
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
    summary = CandidateEvaluationRunner(detector, quality).run(
        generations,
        candidates,
        run_dir / "evaluation" / "candidate-evaluations.jsonl",
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
) -> None:
    """Run `prepare`, `evaluate`, or `download` from a Modal-authenticated machine."""

    _validate_run_id(run_id)
    output_dir = (
        Path(output) if output else PROJECT_ROOT / "results" / f"modal-{run_id}"
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    if stage == "prepare":
        selected_algorithms = tuple(
            value.strip() for value in algorithms.split(",") if value.strip()
        )
        if not selected_algorithms:
            raise ValueError("--algorithms must contain at least one MarkLLM algorithm")
        prompt_text = Path(prompts).read_text(encoding="utf-8")
        if prompts_per_cell:
            if prompts_per_cell < 1:
                raise ValueError("--prompts-per-cell must be at least 1")
            if not allow_small_smoke:
                raise ValueError(
                    "--prompts-per-cell is an integration-only option; also pass "
                    "--allow-small-smoke"
                )
            prompt_text = _limit_prompts_per_cell(prompt_text, prompts_per_cell)
        print(
            json.dumps(
                generate_corpus.remote(
                    run_id,
                    prompt_text,
                    allow_small_smoke,
                    selected_algorithms,
                ),
                indent=2,
            )
        )
        print(json.dumps(score_corpus.remote(run_id), indent=2))
        _download_prepare_artifacts(run_id, output_dir)
    elif stage == "evaluate":
        if not candidates:
            raise ValueError("--candidates is required for the evaluate stage")
        with run_volume.batch_upload(force=True) as upload:
            upload.put_file(candidates, f"/{run_id}/attacks/evaluation-inputs.jsonl")
        print(json.dumps(evaluate_candidates.remote(run_id), indent=2))
        _download_file(
            f"/{run_id}/evaluation/candidate-evaluations.jsonl",
            output_dir / "candidate-evaluations.jsonl",
        )
        _download_file(
            f"/{run_id}/evaluation/candidate-evaluations.manifest.json",
            output_dir / "candidate-evaluations.manifest.json",
        )
    elif stage == "download":
        _download_prepare_artifacts(run_id, output_dir)
        for remote_name, local_name in (
            ("evaluation/candidate-evaluations.jsonl", "candidate-evaluations.jsonl"),
            (
                "evaluation/candidate-evaluations.manifest.json",
                "candidate-evaluations.manifest.json",
            ),
        ):
            try:
                _download_file(f"/{run_id}/{remote_name}", output_dir / local_name)
            except FileNotFoundError:
                pass
    else:
        raise ValueError("stage must be one of: prepare, evaluate, download")
    print(f"Artifacts downloaded to {output_dir.resolve()}")


def _remote_run_dir(run_id: str) -> Path:
    _validate_run_id(run_id)
    return RUNS_ROOT / run_id


def _validate_run_id(run_id: str) -> None:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}", run_id):
        raise ValueError("run_id must be 1-80 safe filename characters")


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
