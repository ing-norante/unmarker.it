from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .generic_detectors import (
    CopyleaksDetector,
    DetectionRunner,
    GenericCorpusBuilder,
    GenericDetectorReport,
    GptZeroDetector,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Prepare, scan, and report the Gate 2b generic detector matrix"
    )
    commands = parser.add_subparsers(dest="command", required=True)

    prepare = commands.add_parser(
        "prepare", help="Build the immutable 60-original + 240-rewrite corpus"
    )
    prepare.add_argument("--selections", type=Path, required=True)
    prepare.add_argument("--output", type=Path, required=True)

    scan = commands.add_parser(
        "scan-api", help="Run resumable Copyleaks and/or GPTZero API scans"
    )
    scan.add_argument("--manifest", type=Path, required=True)
    scan.add_argument("--output", type=Path, required=True)
    scan.add_argument("--detectors", default="copyleaks,gptzero")
    scan.add_argument("--env-file", type=Path)
    scan.add_argument("--max-workers", type=int, default=2)
    scan.add_argument("--no-resume", action="store_true")
    scan.add_argument("--copyleaks-sensitivity", type=int, default=2)
    scan.add_argument("--copyleaks-sandbox", action="store_true")
    scan.add_argument("--copyleaks-explain", action="store_true")

    report = commands.add_parser(
        "report", help="Join detector results and calculate native-label metrics"
    )
    report.add_argument("--manifest", type=Path, required=True)
    report.add_argument("--results", type=Path, nargs="+", required=True)
    report.add_argument("--output", type=Path, required=True)
    report.add_argument(
        "--required-detectors",
        default="",
        help="Comma-separated detector IDs required for a complete report",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "prepare":
        payload = GenericCorpusBuilder().run(args.selections, args.output)
    elif args.command == "scan-api":
        if args.env_file:
            _load_env_file(
                args.env_file,
                {"COPYLEAKS_EMAIL", "COPYLEAKS_API_KEY", "GPTZERO_API_KEY"},
            )
        requested = _csv(args.detectors)
        unknown = sorted(set(requested) - {"copyleaks", "gptzero"})
        if unknown:
            raise ValueError(f"Unsupported API detectors: {unknown}")
        summaries = []
        for detector_id in requested:
            if detector_id == "copyleaks":
                detector = CopyleaksDetector(
                    os.environ.get("COPYLEAKS_EMAIL", ""),
                    os.environ.get("COPYLEAKS_API_KEY", ""),
                    sensitivity=args.copyleaks_sensitivity,
                    sandbox=args.copyleaks_sandbox,
                    explain=args.copyleaks_explain,
                )
            else:
                detector = GptZeroDetector(
                    os.environ.get("GPTZERO_API_KEY", ""),
                )
            summaries.append(
                DetectionRunner(detector, max_workers=args.max_workers).run(
                    args.manifest,
                    args.output / detector_id,
                    resume=not args.no_resume,
                )
            )
        payload = {"runs": summaries}
    elif args.command == "report":
        payload = GenericDetectorReport().run(
            args.manifest,
            args.results,
            args.output,
            required_detectors=_csv(args.required_detectors),
        )
    else:  # pragma: no cover - argparse guarantees this branch is unreachable
        raise ValueError(args.command)
    print(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True))


def _csv(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


def _load_env_file(path: Path, allowed_keys: set[str]) -> None:
    if not path.exists():
        raise FileNotFoundError(path)
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key not in allowed_keys or os.environ.get(key):
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


if __name__ == "__main__":
    main()
