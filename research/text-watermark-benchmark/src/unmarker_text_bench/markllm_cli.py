from __future__ import annotations

import argparse
from pathlib import Path

from .markllm_backend import OfficialMarkLLMBackend
from .markllm_gate import Gate2Config, MarkLLMGateRunner, load_prompts

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EVIDENCE_MODEL = "Qwen/Qwen3-14B"
DEFAULT_EVIDENCE_MODEL_REVISION = "40c069824f4251a91eefaf281ebe4c544efd3e18"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate and detect a non-lexicalized Gate 2 corpus with official MarkLLM"
    )
    parser.add_argument("--markllm-root", type=Path, required=True)
    parser.add_argument(
        "--prompts",
        type=Path,
        default=PROJECT_ROOT / "datasets" / "markllm-smoke-prompts.jsonl",
    )
    parser.add_argument(
        "--output", type=Path, default=PROJECT_ROOT / "results" / "markllm-latest"
    )
    parser.add_argument("--model", default=DEFAULT_EVIDENCE_MODEL)
    parser.add_argument("--model-revision", default=DEFAULT_EVIDENCE_MODEL_REVISION)
    parser.add_argument("--algorithms", default="KGW,Unigram,SynthID")
    parser.add_argument(
        "--device", choices=("auto", "cpu", "mps", "cuda"), default="auto"
    )
    parser.add_argument("--max-new-tokens", type=int, default=192)
    parser.add_argument("--min-generated-tokens", type=int, default=80)
    parser.add_argument("--min-calibration-prompts-per-language", type=int, default=100)
    parser.add_argument("--min-evaluation-prompts-per-language", type=int, default=100)
    parser.add_argument("--seed", type=int, default=20260819)
    parser.add_argument(
        "--raw-prompt", action="store_true", help="Disable the model chat template"
    )
    parser.add_argument("--enable-thinking", action="store_true")
    parser.add_argument("--no-resume", action="store_true")
    parser.add_argument(
        "--allow-small-smoke",
        action="store_true",
        help="Bypass the 200-prompts-per-language evidence gate for integration testing only",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    algorithms = tuple(
        value.strip() for value in args.algorithms.split(",") if value.strip()
    )
    config = Gate2Config(
        algorithms=algorithms,
        min_calibration_prompts_per_language=args.min_calibration_prompts_per_language,
        min_evaluation_prompts_per_language=args.min_evaluation_prompts_per_language,
        min_generated_tokens=args.min_generated_tokens,
        seed=args.seed,
        allow_small_smoke=args.allow_small_smoke,
    )
    prompts = load_prompts(args.prompts)
    backend = OfficialMarkLLMBackend(
        markllm_root=args.markllm_root,
        model_name=args.model,
        model_revision=args.model_revision,
        algorithms=algorithms,
        device=args.device,
        max_new_tokens=args.max_new_tokens,
        min_new_tokens=min(args.min_generated_tokens, args.max_new_tokens),
        use_chat_template=not args.raw_prompt,
        enable_thinking=args.enable_thinking,
    )
    summary = MarkLLMGateRunner(prompts, backend, config).run(
        args.output,
        resume=not args.no_resume,
    )
    print(f"Gate 2 corpus: {summary['source_prompt_count']} independent prompts")
    for cell in summary["cells"]:
        print(
            f"{cell['algorithm']:<9} {cell['language']} "
            f"TPR={cell['watermarked_tpr_at_calibrated_threshold']:.3f} "
            f"FPR={cell['empirical_unwatermarked_fpr']:.3f} "
            f"tokens={cell['mean_watermarked_tokens']:.1f}"
        )
    print(f"Artifacts: {args.output.resolve()}")


if __name__ == "__main__":
    main()
