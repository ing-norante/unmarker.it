from __future__ import annotations

import argparse
from pathlib import Path

from .runner import BenchmarkConfig, BenchmarkRunner, compact_summary


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the bilingual text watermark benchmark")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=PROJECT_ROOT / "datasets" / "bilingual-reference.jsonl",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "results" / "latest",
    )
    parser.add_argument("--limit", type=int)
    parser.add_argument("--null-keys", type=int, default=128)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = BenchmarkConfig(calibration_null_keys=args.null_keys)
    runner = BenchmarkRunner.from_jsonl(args.dataset, config, args.limit)
    summary = runner.run(args.output)
    print(compact_summary(summary))
    print(f"\nArtifacts: {args.output.resolve()}")


if __name__ == "__main__":
    main()
