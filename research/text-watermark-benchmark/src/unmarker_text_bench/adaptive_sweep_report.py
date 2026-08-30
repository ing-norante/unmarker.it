from __future__ import annotations

import argparse
import json
import math
import statistics
from itertools import combinations
from pathlib import Path
from typing import Any


def summarize_sweep_result(path: Path, expected_count: int) -> dict[str, Any]:
    rows = _read_jsonl(path)
    successes = [row for row in rows if row.get("status") == "success"]
    selected = [row["result"]["selected"] for row in successes]
    baselines = [row["result"]["baseline"] for row in successes]

    def signal(item: dict[str, Any], detector_id: str) -> dict[str, Any] | None:
        return next(
            (
                value
                for value in item.get("detector_signals", [])
                if value.get("detector_id") == detector_id
            ),
            None,
        )

    def rate(values: list[bool]) -> float | None:
        return sum(values) / len(values) if values else None

    radar_clear = [
        bool(value is not None and not value.get("detected"))
        for item in selected
        if (value := signal(item, "radar")) is not None
    ]
    target_clear = [
        bool(value is not None and not value.get("detected"))
        for item in selected
        if (value := signal(item, "markllm_exp")) is not None
    ]
    baseline_radar_detected = [
        bool(value is not None and value.get("detected"))
        for item in baselines
        if (value := signal(item, "radar")) is not None
    ]
    baseline_target_detected = [
        bool(value is not None and value.get("detected"))
        for item in baselines
        if (value := signal(item, "markllm_exp")) is not None
    ]
    conditional_radar_evasion = [
        not selected_signal.get("detected")
        for baseline, item in zip(baselines, selected, strict=True)
        if (baseline_signal := signal(baseline, "radar")) is not None
        and baseline_signal.get("detected")
        and (selected_signal := signal(item, "radar")) is not None
    ]
    conditional_target_evasion = [
        not selected_signal.get("detected")
        for baseline, item in zip(baselines, selected, strict=True)
        if (baseline_signal := signal(baseline, "markllm_exp")) is not None
        and baseline_signal.get("detected")
        and (selected_signal := signal(item, "markllm_exp")) is not None
    ]
    quality_pass = [bool(item.get("quality_pass")) for item in selected]
    accepted = [bool(item.get("accepted")) for item in selected]
    material_error = [
        bool((item.get("judge") or {}).get("material_error")) for item in selected
    ]
    protected_pass = [
        bool((item.get("deterministic_quality") or {}).get("passes"))
        for item in selected
    ]
    usage = [row["result"].get("metadata", {}).get("usage", {}) for row in successes]
    costs = [float(value["cost_usd"]) for value in usage if value.get("cost_usd")]
    latencies = [
        float(value["latency_ms"]) for value in usage if value.get("latency_ms")
    ]
    edits = [float(item["changed_token_ratio"]) for item in selected]
    stages = {
        stage: sum(
            item.get("candidate", {}).get("stage") == stage for item in selected
        )
        for stage in sorted(
            {
                str(item.get("candidate", {}).get("stage"))
                for item in selected
            }
        )
    }
    return {
        "path": str(path),
        "expected_count": expected_count,
        "row_count": len(rows),
        "success_count": len(successes),
        "error_count": len(rows) - len(successes),
        "complete": len(rows) == expected_count and len(successes) == expected_count,
        "accepted_count": sum(accepted),
        "accepted_rate": rate(accepted),
        "accepted_wilson_95": _wilson_interval(sum(accepted), len(accepted)),
        "baseline_radar_detected_count": sum(baseline_radar_detected),
        "baseline_radar_detected_rate": rate(baseline_radar_detected),
        "radar_clear_count": sum(radar_clear),
        "radar_clear_rate": rate(radar_clear),
        "radar_clear_wilson_95": _wilson_interval(
            sum(radar_clear), len(radar_clear)
        ),
        "conditional_radar_evasion_count": sum(conditional_radar_evasion),
        "conditional_radar_evasion_rate": rate(conditional_radar_evasion),
        "baseline_target_detected_count": sum(baseline_target_detected),
        "baseline_target_detected_rate": rate(baseline_target_detected),
        "target_clear_count": sum(target_clear),
        "target_clear_rate": rate(target_clear),
        "target_clear_wilson_95": _wilson_interval(
            sum(target_clear), len(target_clear)
        ),
        "conditional_target_evasion_count": sum(conditional_target_evasion),
        "conditional_target_evasion_rate": rate(conditional_target_evasion),
        "quality_pass_rate": rate(quality_pass),
        "protected_pass_rate": rate(protected_pass),
        "material_error_rate": rate(material_error),
        "mean_changed_token_ratio": statistics.fmean(edits) if edits else None,
        "median_changed_token_ratio": statistics.median(edits) if edits else None,
        "mean_cost_usd": statistics.fmean(costs) if costs else None,
        "total_cost_usd": sum(costs),
        "median_latency_ms": statistics.median(latencies) if latencies else None,
        "selected_stages": stages,
    }


def rank_complete_models(summaries: dict[str, dict[str, Any]]) -> list[str]:
    complete = [(model, summary) for model, summary in summaries.items() if summary["complete"]]
    return [
        model
        for model, _ in sorted(
            complete,
            key=lambda pair: (
                -_number(pair[1]["accepted_rate"]),
                -_number(pair[1]["radar_clear_rate"]),
                -_number(pair[1]["target_clear_rate"]),
                _number(pair[1]["material_error_rate"], fallback=1.0),
                _number(pair[1]["mean_changed_token_ratio"], fallback=1.0),
                _number(pair[1]["mean_cost_usd"], fallback=float("inf")),
                pair[0],
            ),
        )
    ]


def write_sweep_report(
    model_paths: dict[str, Path], output_dir: Path, *, expected_count: int
) -> dict[str, Any]:
    summaries = {
        model: summarize_sweep_result(path, expected_count)
        for model, path in model_paths.items()
    }
    ranking = rank_complete_models(summaries)
    complete_outcomes = {
        model: _accepted_by_request(model_paths[model])
        for model, summary in summaries.items()
        if summary["complete"]
    }
    pairwise = {}
    for model_a, model_b in combinations(sorted(complete_outcomes), 2):
        values_a = complete_outcomes[model_a]
        values_b = complete_outcomes[model_b]
        shared = sorted(set(values_a) & set(values_b))
        a_only = sum(values_a[key] and not values_b[key] for key in shared)
        b_only = sum(values_b[key] and not values_a[key] for key in shared)
        pairwise[f"{model_a}_vs_{model_b}"] = {
            "model_a": model_a,
            "model_b": model_b,
            "paired_request_count": len(shared),
            "same_request_set": set(values_a) == set(values_b),
            "both_accepted": sum(values_a[key] and values_b[key] for key in shared),
            "model_a_only_accepted": a_only,
            "model_b_only_accepted": b_only,
            "neither_accepted": sum(
                not values_a[key] and not values_b[key] for key in shared
            ),
            "mcnemar_exact_two_sided_p": _mcnemar_exact(a_only, b_only),
        }
    payload = {
        "artifact_schema_version": 1,
        "artifact_kind": "adaptive-development-model-sweep-summary",
        "expected_documents_per_model": expected_count,
        "selection_order": [
            "accepted_rate",
            "radar_clear_rate",
            "target_clear_rate",
            "material_error_rate",
            "mean_changed_token_ratio",
            "mean_cost_usd",
        ],
        "summaries": summaries,
        "paired_acceptance": pairwise,
        "ranking": ranking,
        "selected_model": ranking[0] if ranking else None,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize an adaptive model sweep")
    parser.add_argument(
        "--model",
        action="append",
        required=True,
        help="Model label and JSONL path as LABEL=PATH",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-count", type=int, required=True)
    args = parser.parse_args()
    model_paths = {}
    for value in args.model:
        label, separator, path = value.partition("=")
        if not separator or not label or not path:
            raise ValueError("--model values must use LABEL=PATH")
        model_paths[label] = Path(path)
    payload = write_sweep_report(
        model_paths, args.output, expected_count=args.expected_count
    )
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def _number(value: Any, *, fallback: float = 0.0) -> float:
    return float(value) if value is not None else fallback


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


def _accepted_by_request(path: Path) -> dict[str, bool]:
    return {
        str(row["request_id"]): bool(row["result"]["selected"]["accepted"])
        for row in _read_jsonl(path)
        if row.get("status") == "success"
    }


def _mcnemar_exact(a_only: int, b_only: int) -> float | None:
    discordant = a_only + b_only
    if discordant == 0:
        return None
    tail = sum(
        math.comb(discordant, index)
        for index in range(min(a_only, b_only) + 1)
    ) / (2**discordant)
    return min(1.0, 2 * tail)


if __name__ == "__main__":
    main()
