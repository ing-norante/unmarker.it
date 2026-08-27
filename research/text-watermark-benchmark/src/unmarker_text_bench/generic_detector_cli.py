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

    controls = commands.add_parser(
        "build-controls",
        help="Build independent, length-matched human controls from pinned Wikipedia",
    )
    controls.add_argument("--benchmark", type=Path, required=True)
    controls.add_argument("--output", type=Path, required=True)
    controls.add_argument("--calibration-per-language", type=int, default=1_000)
    controls.add_argument("--evaluation-per-language", type=int, default=500)
    controls.add_argument("--seed", type=int, default=20260827)
    controls.add_argument("--shuffle-buffer", type=int, default=20_000)
    controls.add_argument(
        "--italian-book-dir",
        type=Path,
        help="Optional private Italian Markdown chapters for grouped stress controls",
    )
    controls.add_argument("--book-excerpts-per-chapter", type=int, default=3)

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

    scan_local = commands.add_parser(
        "scan-local", help="Run RADAR and/or a fine-tuned XLM-R detector locally"
    )
    scan_local.add_argument("--manifest", type=Path, required=True)
    scan_local.add_argument("--output", type=Path, required=True)
    scan_local.add_argument("--detectors", default="radar")
    scan_local.add_argument("--xlmr-model")
    scan_local.add_argument("--device", default="auto")
    scan_local.add_argument("--no-resume", action="store_true")

    calibrate = commands.add_parser(
        "calibrate", help="Fit per-detector/language thresholds on human controls"
    )
    calibrate.add_argument("--controls", type=Path, required=True)
    calibrate.add_argument("--results", type=Path, nargs="+", required=True)
    calibrate.add_argument("--output", type=Path, required=True)
    calibrate.add_argument("--target-fpr", type=float, default=0.01)
    calibrate.add_argument("--minimum-calibration-rows", type=int, default=1_000)
    calibrate.add_argument("--minimum-evaluation-rows", type=int, default=500)

    report = commands.add_parser(
        "report", help="Join detector results and calculate calibrated metrics"
    )
    report.add_argument("--manifest", type=Path, required=True)
    report.add_argument("--results", type=Path, nargs="+", required=True)
    report.add_argument("--output", type=Path, required=True)
    report.add_argument(
        "--required-detectors",
        default="",
        help="Comma-separated detector IDs required for a complete report",
    )
    report.add_argument(
        "--calibration",
        type=Path,
        help="Optional per-language human-control calibration artifact",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "prepare":
        payload = GenericCorpusBuilder().run(args.selections, args.output)
    elif args.command == "build-controls":
        from .detector_controls import HumanControlCorpusBuilder

        payload = HumanControlCorpusBuilder().run(
            args.benchmark,
            args.output,
            calibration_per_language=args.calibration_per_language,
            evaluation_per_language=args.evaluation_per_language,
            seed=args.seed,
            shuffle_buffer=args.shuffle_buffer,
            italian_book_dir=args.italian_book_dir,
            book_excerpts_per_chapter=args.book_excerpts_per_chapter,
        )
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
    elif args.command == "scan-local":
        from .open_detector_models import radar_detector, xlmr_detector

        requested = _csv(args.detectors)
        unknown = sorted(set(requested) - {"radar", "xlmr_mgt"})
        if unknown:
            raise ValueError(f"Unsupported local detectors: {unknown}")
        if "xlmr_mgt" in requested and not args.xlmr_model:
            raise ValueError("--xlmr-model is required when scanning xlmr_mgt")
        summaries = []
        for detector_id in requested:
            detector = (
                radar_detector(device=args.device)
                if detector_id == "radar"
                else xlmr_detector(args.xlmr_model, device=args.device)
            )
            summaries.append(
                DetectionRunner(detector, max_workers=1).run(
                    args.manifest,
                    args.output / detector_id,
                    resume=not args.no_resume,
                )
            )
        payload = {"runs": summaries}
    elif args.command == "calibrate":
        from .detector_calibration import DetectorCalibrator

        payload = DetectorCalibrator().run(
            args.controls,
            args.results,
            args.output,
            target_fpr=args.target_fpr,
            minimum_calibration_rows=args.minimum_calibration_rows,
            minimum_evaluation_rows=args.minimum_evaluation_rows,
        )
    elif args.command == "report":
        payload = GenericDetectorReport().run(
            args.manifest,
            args.results,
            args.output,
            required_detectors=_csv(args.required_detectors),
            calibration_path=args.calibration,
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
