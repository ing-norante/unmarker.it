from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import Counter
from pathlib import Path
from typing import Any


def summarize_confirmation_rows(
    rows: list[dict[str, Any]], *, expected_count: int
) -> dict[str, Any]:
    successes = [row for row in rows if row.get("status") == "success"]
    accepted = [bool(row["result"]["selected"]["accepted"]) for row in successes]
    detector_ids = sorted(
        {
            str(signal["detector_id"])
            for row in successes
            for side in ("baseline", "selected")
            for signal in row["result"][side].get("detector_signals", [])
        }
    )
    detectors = {}
    for detector_id in detector_ids:
        baseline_detected = 0
        selected_clear = 0
        conditional_evasion = 0
        observed = 0
        baseline_margins: list[float] = []
        selected_margins: list[float] = []
        for row in successes:
            baseline = _signal(row["result"]["baseline"], detector_id)
            selected = _signal(row["result"]["selected"], detector_id)
            if baseline is None or selected is None:
                continue
            observed += 1
            baseline_margins.append(float(baseline["calibrated_margin"]))
            selected_margins.append(float(selected["calibrated_margin"]))
            was_detected = bool(baseline.get("detected"))
            is_clear = not bool(selected.get("detected"))
            baseline_detected += was_detected
            selected_clear += is_clear
            conditional_evasion += was_detected and is_clear
        detectors[detector_id] = {
            "observed_count": observed,
            "baseline_detected_count": baseline_detected,
            "baseline_detected_rate": _rate(baseline_detected, observed),
            "selected_clear_count": selected_clear,
            "selected_clear_rate": _rate(selected_clear, observed),
            "conditional_evasion_count": conditional_evasion,
            "conditional_evasion_rate": _rate(
                conditional_evasion, baseline_detected
            ),
            "mean_baseline_margin": (
                statistics.fmean(baseline_margins) if baseline_margins else None
            ),
            "mean_selected_margin": (
                statistics.fmean(selected_margins) if selected_margins else None
            ),
            "mean_margin_change": (
                statistics.fmean(
                    selected - baseline
                    for baseline, selected in zip(
                        baseline_margins, selected_margins, strict=True
                    )
                )
                if baseline_margins
                else None
            ),
        }

    selected = [row["result"]["selected"] for row in successes]
    usage = [row["result"].get("metadata", {}).get("usage", {}) for row in successes]
    costs = [float(value["cost_usd"]) for value in usage if value.get("cost_usd")]
    latencies = [
        float(value["latency_ms"]) for value in usage if value.get("latency_ms")
    ]
    edits = [float(value["changed_token_ratio"]) for value in selected]
    quality = [bool(value.get("quality_pass")) for value in selected]
    protected = [
        bool((value.get("deterministic_quality") or {}).get("passes"))
        for value in selected
    ]
    material_errors = [
        bool((value.get("judge") or {}).get("material_error"))
        for value in selected
    ]
    detected_by_candidate = [
        [
            str(signal["detector_id"])
            for signal in value.get("detector_signals", [])
            if signal.get("detected")
        ]
        for value in selected
    ]
    quality_and_target_clear = sum(
        passes and "markllm_exp" not in detected
        for passes, detected in zip(quality, detected_by_candidate, strict=True)
    )
    quality_and_generic_clear = sum(
        passes and not [value for value in detected if value != "markllm_exp"]
        for passes, detected in zip(quality, detected_by_candidate, strict=True)
    )
    single_detector_blockers = Counter(
        detected[0]
        for passes, detected in zip(quality, detected_by_candidate, strict=True)
        if passes and len(detected) == 1
    )
    return {
        "expected_count": expected_count,
        "row_count": len(rows),
        "success_count": len(successes),
        "error_count": len(rows) - len(successes),
        "complete": len(rows) == expected_count and len(successes) == expected_count,
        "accepted_count": sum(accepted),
        "accepted_rate": _rate(sum(accepted), len(accepted)),
        "accepted_wilson_95": _wilson_interval(sum(accepted), len(accepted)),
        "quality_pass_count": sum(quality),
        "protected_pass_count": sum(protected),
        "material_error_count": sum(material_errors),
        "quality_and_target_clear_count": quality_and_target_clear,
        "quality_and_all_generic_clear_count": quality_and_generic_clear,
        "quality_pass_single_detector_blockers": dict(
            sorted(single_detector_blockers.items())
        ),
        "mean_changed_token_ratio": statistics.fmean(edits) if edits else None,
        "median_changed_token_ratio": statistics.median(edits) if edits else None,
        "total_cost_usd": sum(costs),
        "mean_cost_usd": statistics.fmean(costs) if costs else None,
        "median_latency_ms": statistics.median(latencies) if latencies else None,
        "detectors": detectors,
    }


def write_confirmation_report(
    language_paths: dict[str, Path],
    output_dir: Path,
    *,
    expected_per_language: int,
) -> dict[str, Any]:
    rows_by_language = {
        language: _read_jsonl(path) for language, path in language_paths.items()
    }
    request_ids = [
        str(row["request_id"])
        for rows in rows_by_language.values()
        for row in rows
    ]
    if len(request_ids) != len(set(request_ids)):
        raise ValueError("Confirmation result files contain duplicate request IDs")
    summaries = {
        language: summarize_confirmation_rows(
            rows, expected_count=expected_per_language
        )
        for language, rows in rows_by_language.items()
    }
    combined_rows = [row for rows in rows_by_language.values() for row in rows]
    payload = {
        "artifact_schema_version": 1,
        "artifact_kind": "adaptive-fresh-confirmation-summary",
        "expected_per_language": expected_per_language,
        "languages": summaries,
        "combined": summarize_confirmation_rows(
            combined_rows,
            expected_count=expected_per_language * len(language_paths),
        ),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Summarize a bilingual adaptive confirmation run"
    )
    parser.add_argument(
        "--language",
        action="append",
        required=True,
        help="Language and result JSONL path as LANG=PATH",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-per-language", type=int, required=True)
    args = parser.parse_args()
    language_paths = {}
    for value in args.language:
        language, separator, path = value.partition("=")
        if not separator or not language or not path:
            raise ValueError("--language values must use LANG=PATH")
        language_paths[language] = Path(path)
    payload = write_confirmation_report(
        language_paths,
        args.output,
        expected_per_language=args.expected_per_language,
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def _signal(item: dict[str, Any], detector_id: str) -> dict[str, Any] | None:
    return next(
        (
            value
            for value in item.get("detector_signals", [])
            if value.get("detector_id") == detector_id
        ),
        None,
    )


def _rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _wilson_interval(successes: int, total: int) -> list[float] | None:
    if total == 0:
        return None
    z = 1.959963984540054
    proportion = successes / total
    denominator = 1 + z * z / total
    centre = (proportion + z * z / (2 * total)) / denominator
    radius = (
        z
        * math.sqrt(
            proportion * (1 - proportion) / total
            + z * z / (4 * total * total)
        )
        / denominator
    )
    return [centre - radius, centre + radius]


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


if __name__ == "__main__":
    main()
