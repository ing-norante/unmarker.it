from __future__ import annotations

import hashlib
import math
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .generic_detectors import read_jsonl, utc_now, write_json

CALIBRATION_KIND = "unmarker-generic-detector-calibration"

KNOWN_SCORE_DIRECTIONS = {
    "binoculars": "lower_is_ai",
    "copyleaks": "higher_is_ai",
    "fast_detect_gpt": "higher_is_ai",
    "gptzero": "higher_is_ai",
    "logrank": "higher_is_ai",
    "radar": "higher_is_ai",
    "xlmr_mgt": "higher_is_ai",
}


def score_direction(result: dict[str, Any], detector_id: str) -> str:
    direction = result.get("score_direction") or KNOWN_SCORE_DIRECTIONS.get(detector_id)
    if direction not in {"higher_is_ai", "lower_is_ai"}:
        raise ValueError(
            f"Detector {detector_id!r} must declare score_direction as "
            "higher_is_ai or lower_is_ai"
        )
    return str(direction)


def apply_threshold(score: float, operator: str, threshold: float) -> bool:
    if operator == "gt":
        return score > threshold
    if operator == "lt":
        return score < threshold
    raise ValueError(f"Unsupported calibration operator: {operator!r}")


class DetectorCalibrator:
    """Fit language-specific empirical thresholds on independent human controls."""

    def run(
        self,
        controls_path: Path,
        result_paths: Sequence[Path],
        output_path: Path,
        *,
        target_fpr: float = 0.01,
        minimum_calibration_rows: int = 1_000,
        minimum_evaluation_rows: int = 500,
    ) -> dict[str, Any]:
        if not 0 < target_fpr < 1:
            raise ValueError("target_fpr must be between zero and one")
        if minimum_calibration_rows < 1:
            raise ValueError("minimum_calibration_rows must be positive")
        if minimum_evaluation_rows < 1:
            raise ValueError("minimum_evaluation_rows must be positive")
        controls = read_jsonl(controls_path)
        self._validate_controls(controls)
        controls_by_id = {str(row["document_id"]): row for row in controls}

        grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
        model_versions: dict[str, set[str]] = defaultdict(set)
        score_names: dict[str, set[str]] = defaultdict(set)
        directions: dict[str, set[str]] = defaultdict(set)
        successful_results: dict[tuple[str, str], dict[str, Any]] = {}
        seen: set[tuple[str, str]] = set()
        result_hashes: dict[str, str] = {}
        for path in result_paths:
            result_hashes[str(path)] = hashlib.sha256(path.read_bytes()).hexdigest()
            for result in read_jsonl(path):
                detector_id = str(result.get("detector_id"))
                document_id = str(result.get("document_id"))
                key = (detector_id, document_id)
                if key in seen:
                    raise ValueError(f"Duplicate control result: {key}")
                seen.add(key)
                control = controls_by_id.get(document_id)
                if control is None:
                    raise ValueError(f"Unknown control result document: {document_id}")
                if result.get("text_sha256") != control.get("text_sha256"):
                    raise ValueError(f"Control result hash mismatch: {document_id}")
                if result.get("status") != "success" or result.get("score") is None:
                    continue
                language = str(control["language"])
                split = str(control["control_split"])
                grouped[(detector_id, language, split)].append(result)
                successful_results[(detector_id, document_id)] = result
                directions[detector_id].add(score_direction(result, detector_id))
                if result.get("model_version"):
                    model_versions[detector_id].add(str(result["model_version"]))
                if result.get("score_name"):
                    score_names[detector_id].add(str(result["score_name"]))

        detectors: dict[str, Any] = {}
        for detector_id in sorted({key[0] for key in grouped}):
            if len(directions[detector_id]) != 1:
                raise ValueError(
                    f"Inconsistent score directions for {detector_id}: "
                    f"{sorted(directions[detector_id])}"
                )
            direction = next(iter(directions[detector_id]))
            detector_payload: dict[str, Any] = {
                "score_direction": direction,
                "score_names": sorted(score_names[detector_id]),
                "model_versions": sorted(model_versions[detector_id]),
                "languages": {},
            }
            for language in sorted({row["language"] for row in controls}):
                calibration_rows = grouped.get(
                    (detector_id, str(language), "calibration"), []
                )
                evaluation_rows = grouped.get(
                    (detector_id, str(language), "evaluation"), []
                )
                if len(calibration_rows) < minimum_calibration_rows:
                    raise ValueError(
                        f"{detector_id}/{language} has {len(calibration_rows)} "
                        f"calibration controls; requires {minimum_calibration_rows}"
                    )
                if len(evaluation_rows) < minimum_evaluation_rows:
                    raise ValueError(
                        f"{detector_id}/{language} has {len(evaluation_rows)} "
                        f"evaluation controls; requires {minimum_evaluation_rows}"
                    )
                threshold, operator, allowed_fp = self._threshold(
                    [float(row["score"]) for row in calibration_rows],
                    direction,
                    target_fpr,
                )
                calibration_fp = sum(
                    apply_threshold(float(row["score"]), operator, threshold)
                    for row in calibration_rows
                )
                evaluation_fp = sum(
                    apply_threshold(float(row["score"]), operator, threshold)
                    for row in evaluation_rows
                )
                detector_payload["languages"][str(language)] = {
                    "operator": operator,
                    "threshold": threshold,
                    "target_fpr": target_fpr,
                    "calibration_rows": len(calibration_rows),
                    "allowed_calibration_false_positives": allowed_fp,
                    "calibration_false_positives": calibration_fp,
                    "calibration_fpr": calibration_fp / len(calibration_rows),
                    "calibration_fpr_wilson_95pct": _wilson_interval(
                        calibration_fp, len(calibration_rows)
                    ),
                    "evaluation_rows": len(evaluation_rows),
                    "evaluation_false_positives": evaluation_fp,
                    "evaluation_fpr": (
                        evaluation_fp / len(evaluation_rows)
                        if evaluation_rows
                        else None
                    ),
                    "evaluation_fpr_wilson_95pct": _wilson_interval(
                        evaluation_fp, len(evaluation_rows)
                    ),
                    "stress_evaluations": self._stress_evaluations(
                        detector_id,
                        str(language),
                        controls,
                        successful_results,
                        operator,
                        threshold,
                    ),
                }
            detectors[detector_id] = detector_payload
        if not detectors:
            raise ValueError("No successful scored control results were provided")

        payload = {
            "artifact_schema_version": 1,
            "artifact_kind": CALIBRATION_KIND,
            "created_at": utc_now(),
            "target_fpr": target_fpr,
            "minimum_calibration_rows": minimum_calibration_rows,
            "minimum_evaluation_rows": minimum_evaluation_rows,
            "decision_contract": (
                "strict-empirical-quantile-plus-grouped-human-stress-per-language-v2"
            ),
            "controls_path": str(controls_path),
            "controls_sha256": hashlib.sha256(controls_path.read_bytes()).hexdigest(),
            "control_count": len(controls),
            "result_sha256": result_hashes,
            "detectors": detectors,
        }
        write_json(output_path, payload)
        return payload

    @staticmethod
    def _threshold(
        scores: Sequence[float], direction: str, target_fpr: float
    ) -> tuple[float, str, int]:
        ordered = sorted(scores)
        allowed_fp = math.floor(target_fpr * len(ordered))
        if direction == "higher_is_ai":
            threshold = ordered[-allowed_fp - 1] if allowed_fp else ordered[-1]
            return float(threshold), "gt", allowed_fp
        threshold = ordered[allowed_fp] if allowed_fp else ordered[0]
        return float(threshold), "lt", allowed_fp

    @staticmethod
    def _validate_controls(controls: Sequence[dict[str, Any]]) -> None:
        if not controls:
            raise ValueError("Human control corpus is empty")
        ids = [row.get("document_id") for row in controls]
        if len(set(ids)) != len(ids):
            raise ValueError("Human control corpus has duplicate document IDs")
        for row in controls:
            if row.get("role") != "human_control":
                raise ValueError("Every calibration document must be a human_control")
            if row.get("control_split") not in {
                "calibration",
                "evaluation",
                "stress_evaluation",
            }:
                raise ValueError(
                    "control_split must be calibration, evaluation, or stress_evaluation"
                )
            if row.get("language") not in {"en", "it"}:
                raise ValueError("Only English and Italian controls are supported")
            if row.get("control_split") == "stress_evaluation" and (
                not row.get("control_group") or not row.get("source_group_id")
            ):
                raise ValueError(
                    "Stress controls require control_group and source_group_id"
                )

    @staticmethod
    def _stress_evaluations(
        detector_id: str,
        language: str,
        controls: Sequence[dict[str, Any]],
        results: dict[tuple[str, str], dict[str, Any]],
        operator: str,
        threshold: float,
    ) -> dict[str, Any]:
        grouped_controls: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for control in controls:
            if (
                str(control.get("language")) == language
                and control.get("control_split") == "stress_evaluation"
            ):
                grouped_controls[str(control["control_group"])].append(control)
        output: dict[str, Any] = {}
        for control_group, group_controls in sorted(grouped_controls.items()):
            expected_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
            scored_by_source: dict[str, list[bool]] = defaultdict(list)
            false_positives = 0
            scored_rows = 0
            for control in group_controls:
                source_group = str(control["source_group_id"])
                expected_by_source[source_group].append(control)
                result = results.get((detector_id, str(control["document_id"])))
                if result is None:
                    continue
                detected = apply_threshold(float(result["score"]), operator, threshold)
                scored_by_source[source_group].append(detected)
                scored_rows += 1
                false_positives += int(detected)
            complete_source_groups = [
                source_group
                for source_group, expected in expected_by_source.items()
                if len(scored_by_source[source_group]) == len(expected)
            ]
            groups_with_any_false_positive = sum(
                any(scored_by_source[source_group])
                for source_group in complete_source_groups
            )
            output[control_group] = {
                "expected_rows": len(group_controls),
                "scored_rows": scored_rows,
                "complete": scored_rows == len(group_controls),
                "false_positives": false_positives,
                "fpr": false_positives / scored_rows if scored_rows else None,
                "fpr_wilson_95pct": _wilson_interval(false_positives, scored_rows),
                "grouping_unit": "source_group_id",
                "expected_groups": len(expected_by_source),
                "fully_scored_groups": len(complete_source_groups),
                "groups_with_any_false_positive": groups_with_any_false_positive,
                "groups_with_any_false_positive_rate": (
                    groups_with_any_false_positive / len(complete_source_groups)
                    if complete_source_groups
                    else None
                ),
                "groups_with_any_false_positive_rate_wilson_95pct": _wilson_interval(
                    groups_with_any_false_positive, len(complete_source_groups)
                ),
            }
        return output


def _wilson_interval(
    successes: int, total: int, z: float = 1.959963984540054
) -> list[float] | None:
    if total == 0:
        return None
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    margin = (
        z
        * ((proportion * (1 - proportion) / total + z * z / (4 * total * total)) ** 0.5)
        / denominator
    )
    return [max(0.0, center - margin), min(1.0, center + margin)]
