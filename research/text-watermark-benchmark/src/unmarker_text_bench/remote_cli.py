from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .attack_pipeline import AttackConfig, AttackRunner
from .final_report import FinalReportRunner
from .llm_judge import (
    DEFAULT_JUDGE_MODEL,
    DEFAULT_JUDGE_PROVIDER,
    LlmJudgeRunner,
)
from .openrouter_backend import (
    DEFAULT_OPENROUTER_MODEL,
    DEFAULT_OPENROUTER_TOKENIZER,
    DEFAULT_OPENROUTER_TOKENIZER_REVISION,
    HuggingFaceLogitBiasTokenizer,
    OpenRouterRewriter,
)
from .protected_spans import ProtectedSpanIndex


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="OpenRouter attack and reporting stages"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    attack = subparsers.add_parser(
        "attack", help="Generate all fixed-budget candidates"
    )
    attack.add_argument("--generations", type=Path, required=True)
    attack.add_argument("--scores", type=Path, required=True)
    attack.add_argument("--output", type=Path, required=True)
    attack.add_argument("--env-file", type=Path)
    attack.add_argument("--model", default=DEFAULT_OPENROUTER_MODEL)
    attack.add_argument("--provider", default="DeepInfra")
    attack.add_argument("--tokenizer", default=DEFAULT_OPENROUTER_TOKENIZER)
    attack.add_argument(
        "--tokenizer-revision", default=DEFAULT_OPENROUTER_TOKENIZER_REVISION
    )
    attack.add_argument("--temperature", type=float, default=0.2)
    attack.add_argument("--max-tokens", type=int, default=4096)
    attack.add_argument("--length-retry-max-tokens", type=int, default=16384)
    attack.add_argument(
        "--reasoning-effort",
        default="none",
        help="Use none for non-thinking models; otherwise low, medium, etc.",
    )
    attack.add_argument(
        "--pipelines", default="simple_paraphrase,sira,bira,bira_position_aware"
    )
    attack.add_argument(
        "--algorithms",
        default="",
        help="Optional comma-separated MarkLLM subset for a bounded pilot",
    )
    attack.add_argument("--beta-calibration-per-language", type=int, default=10)
    attack.add_argument("--initial-bira-beta", type=float, default=-10.0)
    attack.add_argument("--max-evaluation-prompts-per-language", type=int)
    attack.add_argument("--oracle-max-attempts", type=int, default=3)
    attack.add_argument("--no-oracle-baseline", action="store_true")
    attack.add_argument("--no-restamp-control", action="store_true")
    attack.add_argument("--allow-provider-fallbacks", action="store_true")
    attack.add_argument("--send-seed", action="store_true")
    attack.add_argument("--no-resume", action="store_true")
    attack.add_argument(
        "--profile",
        choices=("custom", "gate2b-exp-pilot"),
        default="custom",
    )
    attack.add_argument(
        "--quality-profile",
        choices=("legacy-v1", "gliner-v1"),
        default="legacy-v1",
    )
    attack.add_argument("--protected-spans", type=Path)
    attack.add_argument("--protected-spans-manifest", type=Path)
    attack.add_argument("--development-prompts-per-language", type=int)
    attack.add_argument("--max-workers", type=int, default=1)

    estimate = subparsers.add_parser(
        "estimate", help="Estimate the minimum API call count"
    )
    estimate.add_argument("--generations", type=Path, required=True)
    estimate.add_argument("--evaluation-prompts-per-language", type=int)
    estimate.add_argument("--beta-calibration-per-language", type=int, default=10)
    estimate.add_argument("--oracle-max-attempts", type=int, default=3)
    estimate.add_argument("--no-oracle-baseline", action="store_true")
    estimate.add_argument("--no-restamp-control", action="store_true")

    finalize = subparsers.add_parser(
        "finalize", help="Build held-out metrics and review sheet"
    )
    finalize.add_argument("--candidates", type=Path, required=True)
    finalize.add_argument("--baselines", type=Path, required=True)
    finalize.add_argument("--evaluations", type=Path, required=True)
    finalize.add_argument("--api-calls", type=Path, required=True)
    finalize.add_argument("--output", type=Path, required=True)
    finalize.add_argument("--judge-evaluations", type=Path)

    judge = subparsers.add_parser(
        "judge", help="Run a blinded structured LLM quality pre-screen"
    )
    judge.add_argument("--selections", type=Path, required=True)
    judge.add_argument("--output", type=Path, required=True)
    judge.add_argument("--env-file", type=Path)
    judge.add_argument("--model", default=DEFAULT_JUDGE_MODEL)
    judge.add_argument("--provider", default=DEFAULT_JUDGE_PROVIDER)
    judge.add_argument("--max-workers", type=int, default=4)
    judge.add_argument("--manual-audit-size", type=int, default=48)
    judge.add_argument("--no-resume", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "attack":
        if args.env_file:
            _load_env_key(args.env_file, "OPENROUTER_API_KEY")
        if args.profile == "gate2b-exp-pilot":
            if not args.protected_spans:
                raise ValueError(
                    "gate2b-exp-pilot requires --protected-spans from Modal"
                )
            args.quality_profile = "gliner-v1"
            args.pipelines = "simple_paraphrase,sira,bira,bira_position_aware"
            args.algorithms = "EXP"
            args.beta_calibration_per_language = 10
            args.max_evaluation_prompts_per_language = 50
            args.development_prompts_per_language = 20
            args.max_workers = 4
            args.oracle_max_attempts = 3
            args.no_oracle_baseline = False
            args.no_restamp_control = False
        pipelines = tuple(
            value.strip() for value in args.pipelines.split(",") if value.strip()
        )
        algorithms = tuple(
            value.strip() for value in args.algorithms.split(",") if value.strip()
        )
        rewriter = OpenRouterRewriter(
            model=args.model,
            provider=args.provider or None,
            temperature=args.temperature,
            max_tokens=args.max_tokens,
            length_retry_max_tokens=args.length_retry_max_tokens,
            reasoning_effort=args.reasoning_effort,
            allow_fallbacks=args.allow_provider_fallbacks,
        )
        capabilities = rewriter.validate_capabilities(
            require_logit_bias=bool({"bira", "bira_position_aware"} & set(pipelines))
        )
        print(f"OpenRouter preflight: {json.dumps(capabilities, sort_keys=True)}")
        bias_tokenizer = HuggingFaceLogitBiasTokenizer(
            args.tokenizer,
            args.tokenizer_revision,
        )
        protected_spans = (
            ProtectedSpanIndex.load(
                args.protected_spans,
                args.protected_spans_manifest,
            )
            if args.protected_spans
            else None
        )
        if args.profile == "gate2b-exp-pilot" and not protected_spans.metadata.get(
            "threshold_provenance", {}
        ).get("human_approved"):
            raise ValueError(
                "gate2b-exp-pilot requires a manifest built from human-approved "
                "GLiNER thresholds"
            )
        config = AttackConfig(
            pipelines=pipelines,
            algorithms=algorithms or None,
            beta_calibration_per_language=args.beta_calibration_per_language,
            initial_bira_beta=args.initial_bira_beta,
            max_evaluation_prompts_per_language=(
                args.max_evaluation_prompts_per_language
            ),
            enable_oracle_baseline=not args.no_oracle_baseline,
            oracle_max_attempts=args.oracle_max_attempts,
            enable_restamp_control=not args.no_restamp_control,
            send_seed=args.send_seed,
            development_prompts_per_language=(
                args.development_prompts_per_language
            ),
            quality_profile=args.quality_profile,
            max_workers=args.max_workers,
        )
        summary = AttackRunner(
            rewriter,
            bias_tokenizer,
            config,
            protected_spans=protected_spans,
        ).run(
            args.generations,
            args.scores,
            args.output,
            resume=not args.no_resume,
        )
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    elif args.command == "estimate":
        rows = _read_jsonl(args.generations)
        prompts_by_language: dict[str, set[str]] = {}
        calibration_by_language: dict[str, set[str]] = {}
        for row in rows:
            if row["split"] == "evaluation":
                prompts_by_language.setdefault(row["language"], set()).add(
                    row["sample_id"]
                )
            elif row["split"] == "calibration":
                calibration_by_language.setdefault(row["language"], set()).add(
                    row["sample_id"]
                )
        prompts = sum(
            min(len(values), args.evaluation_prompts_per_language)
            if args.evaluation_prompts_per_language
            else len(values)
            for values in prompts_by_language.values()
        )
        cases = prompts * len({row["algorithm"] for row in rows})
        minimum_calls_per_case = 3 + 4 + 3 + 3
        calibration_calls = sum(
            min(len(values), args.beta_calibration_per_language)
            for values in calibration_by_language.values()
        )
        candidate_grid_calls = cases * minimum_calls_per_case
        oracle_calls = (
            cases * args.oracle_max_attempts if not args.no_oracle_baseline else 0
        )
        restamp_calls = prompts if not args.no_restamp_control else 0
        print(
            json.dumps(
                {
                    "independent_evaluation_prompts": prompts,
                    "watermark_cases": cases,
                    "minimum_openrouter_calls": (
                        candidate_grid_calls
                        + oracle_calls
                        + restamp_calls
                        + calibration_calls
                    ),
                    "minimum_calls_per_case": minimum_calls_per_case,
                    "call_breakdown": {
                        "candidate_grid": candidate_grid_calls,
                        "adaptive_oracle_pool": oracle_calls,
                        "restamp_control": restamp_calls,
                        "bira_beta_calibration": calibration_calls,
                    },
                    "adaptive_bira_retries_not_included": True,
                },
                indent=2,
            )
        )
    elif args.command == "finalize":
        summary = FinalReportRunner().run(
            args.candidates,
            args.evaluations,
            args.api_calls,
            args.output,
            baselines_path=args.baselines,
            judge_evaluations_path=args.judge_evaluations,
        )
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    elif args.command == "judge":
        if args.env_file:
            _load_env_key(args.env_file, "OPENROUTER_API_KEY")
        backend = OpenRouterRewriter(
            model=args.model,
            provider=args.provider or None,
            temperature=0.0,
            max_tokens=4096,
            length_retry_max_tokens=8192,
            reasoning_effort="medium",
            allow_fallbacks=False,
        )
        capabilities = backend.validate_capabilities(
            require_logit_bias=False,
            require_structured_output=True,
            require_seed=True,
        )
        print(f"OpenRouter judge preflight: {json.dumps(capabilities, sort_keys=True)}")
        summary = LlmJudgeRunner(backend, max_workers=args.max_workers).run(
            args.selections,
            args.output,
            resume=not args.no_resume,
            manual_audit_size=args.manual_audit_size,
        )
        print(json.dumps(summary, indent=2, ensure_ascii=False))


def _load_env_key(path: Path, key: str) -> None:
    if not path.exists():
        raise FileNotFoundError(path)
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        name, separator, value = line.partition("=")
        if separator and name.strip() == key:
            cleaned = value.strip()
            if (
                len(cleaned) >= 2
                and cleaned[0] == cleaned[-1]
                and cleaned[0] in {'"', "'"}
            ):
                cleaned = cleaned[1:-1]
            if not cleaned:
                raise ValueError(f"{key} is empty in {path}")
            os.environ[key] = cleaned
            return
    raise ValueError(f"{key} was not found in {path}")


def _read_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


if __name__ == "__main__":
    main()
