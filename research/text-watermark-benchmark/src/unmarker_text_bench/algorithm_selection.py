from __future__ import annotations

import hashlib
import json
import math
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from .generic_detectors import (
    EXPECTED_PIPELINES,
    _wilson_interval,
    read_jsonl,
    write_json,
    write_jsonl,
)


class ConfirmationPromptBuilder:
    """Reuse locked calibration prompts and select previously unused evaluation prompts."""

    def run(
        self,
        prompt_pool_path: Path,
        previous_generations_path: Path,
        output_dir: Path,
        *,
        calibration_per_language: int = 100,
        evaluation_per_language: int = 50,
    ) -> dict[str, Any]:
        prompts = read_jsonl(prompt_pool_path)
        generations = read_jsonl(previous_generations_path)
        used_by_split: dict[tuple[str, str], set[str]] = defaultdict(set)
        for row in generations:
            language = str(row.get("language"))
            split = str(row.get("split"))
            sample_id = str(row.get("sample_id"))
            if language in {"en", "it"} and split in {"calibration", "evaluation"}:
                used_by_split[(language, split)].add(sample_id)

        selected: list[dict[str, Any]] = []
        counts: Counter[tuple[str, str]] = Counter()
        for row in prompts:
            language = str(row.get("language"))
            split = str(row.get("split"))
            prompt_id = str(row.get("id"))
            cell = (language, split)
            if language not in {"en", "it"} or split not in {
                "calibration",
                "evaluation",
            }:
                continue
            if split == "calibration":
                include = prompt_id in used_by_split[cell]
                limit = calibration_per_language
            else:
                include = prompt_id not in used_by_split[cell]
                limit = evaluation_per_language
            if include and counts[cell] < limit:
                selected.append(row)
                counts[cell] += 1

        expected = {
            (language, "calibration"): calibration_per_language
            for language in ("en", "it")
        } | {
            (language, "evaluation"): evaluation_per_language
            for language in ("en", "it")
        }
        incomplete = {
            f"{language}:{split}": {
                "expected": count,
                "actual": counts[(language, split)],
            }
            for (language, split), count in expected.items()
            if counts[(language, split)] != count
        }
        if incomplete:
            raise ValueError(f"Confirmation prompt pool is incomplete: {incomplete}")

        evaluation_ids = {
            str(row["id"]) for row in selected if row["split"] == "evaluation"
        }
        prior_evaluation_ids = {
            sample_id
            for (language, split), sample_ids in used_by_split.items()
            if language in {"en", "it"} and split == "evaluation"
            for sample_id in sample_ids
        }
        overlap = sorted(evaluation_ids & prior_evaluation_ids)
        if overlap:
            raise ValueError(f"Confirmation evaluation prompts overlap: {overlap[:5]}")

        output_dir.mkdir(parents=True, exist_ok=True)
        prompts_path = output_dir / "prompts.jsonl"
        write_jsonl(prompts_path, selected)
        manifest = {
            "artifact_schema_version": 1,
            "artifact_kind": "markllm-confirmation-prompts",
            "prompt_pool_path": str(prompt_pool_path),
            "prompt_pool_sha256": _sha256(prompt_pool_path),
            "previous_generations_path": str(previous_generations_path),
            "previous_generations_sha256": _sha256(previous_generations_path),
            "prompts_path": prompts_path.name,
            "prompts_sha256": _sha256(prompts_path),
            "prompt_count": len(selected),
            "counts": {
                f"{language}:{split}": counts[(language, split)]
                for language, split in sorted(expected)
            },
            "evaluation_overlap_with_previous_run": 0,
            "contract": (
                "locked-prior-calibration-plus-unused-evaluation-prompts-v1"
            ),
        }
        write_json(output_dir / "manifest.json", manifest)
        return manifest


class AlgorithmSelectionGate:
    """Rank rewrite pipelines using only qualified detector/language cells."""

    def run(
        self,
        joined_results_path: Path,
        calibration_path: Path,
        output_dir: Path,
        *,
        judge_path: Path | None = None,
        minimum_original_tpr: float = 0.70,
        minimum_original_tpr_wilson_lower: float = 0.50,
        maximum_evaluation_fpr: float = 0.03,
        maximum_book_fpr: float = 0.03,
        bootstrap_samples: int = 10_000,
        seed: int = 20260828,
    ) -> dict[str, Any]:
        rows = read_jsonl(joined_results_path)
        calibration = json.loads(calibration_path.read_text(encoding="utf-8"))
        if not rows:
            raise ValueError("The joined generic-detector report is empty")
        if calibration.get("artifact_kind") != "unmarker-generic-detector-calibration":
            raise ValueError("Invalid generic-detector calibration artifact")
        if bootstrap_samples < 1:
            raise ValueError("bootstrap_samples must be positive")

        originals, rewrites, detectors = self._index(rows)
        if "xlmr_mgt" in detectors:
            raise ValueError(
                "XLM-R is a negative control and cannot enter algorithm selection"
            )
        judge = self._judge_index(judge_path)
        admission = self._admit_detectors(
            originals,
            detectors,
            calibration,
            minimum_original_tpr=minimum_original_tpr,
            minimum_original_tpr_wilson_lower=minimum_original_tpr_wilson_lower,
            maximum_evaluation_fpr=maximum_evaluation_fpr,
            maximum_book_fpr=maximum_book_fpr,
        )
        admitted = {
            language: tuple(
                detector
                for detector in detectors
                if admission[detector][language]["admitted"]
            )
            for language in ("en", "it")
        }
        if any(not values for values in admitted.values()):
            raise ValueError(f"No detector admitted for one or more languages: {admitted}")

        outcomes = self._outcomes(originals, rewrites, admitted, judge)
        metrics = self._metrics(outcomes, judge_available=bool(judge))
        automatic_winner = self._winner(metrics["overall"], "automatic_quality")
        llm_winner = (
            self._winner(metrics["overall"], "llm_quality") if judge else None
        )
        comparisons = self._comparisons(
            outcomes,
            automatic_winner,
            quality_key="automatic_quality",
            bootstrap_samples=bootstrap_samples,
            seed=seed,
        )
        summary = {
            "artifact_schema_version": 1,
            "artifact_kind": "algorithm-selection-gate",
            "inputs": {
                "joined_results_path": str(joined_results_path),
                "joined_results_sha256": _sha256(joined_results_path),
                "calibration_path": str(calibration_path),
                "calibration_sha256": _sha256(calibration_path),
                "judge_path": str(judge_path) if judge_path else None,
                "judge_sha256": _sha256(judge_path) if judge_path else None,
            },
            "contract": {
                "minimum_original_tpr": minimum_original_tpr,
                "minimum_original_tpr_wilson_lower": (
                    minimum_original_tpr_wilson_lower
                ),
                "maximum_evaluation_fpr": maximum_evaluation_fpr,
                "maximum_book_fpr": maximum_book_fpr,
                "primary_outcome": (
                    "paired target-watermark plus every admitted generic detector "
                    "evaded, with the prospective automatic quality gate passing"
                ),
                "quality_sensitivity": (
                    "blinded LLM screen; diagnostic and never substituted for human review"
                    if judge
                    else "unavailable"
                ),
                "negative_controls_excluded": ["xlmr_mgt"],
                "selection_data_status": "algorithm-selection; independent confirmation required",
            },
            "detectors": list(detectors),
            "detector_admission": admission,
            "admitted_detectors": {
                language: list(values) for language, values in admitted.items()
            },
            "metrics": metrics,
            "paired_comparisons": comparisons,
            "selection": {
                "provisional_winner": automatic_winner,
                "llm_quality_sensitivity_winner": llm_winner,
                "winner_stable_across_automatic_and_llm_quality": (
                    llm_winner is None or llm_winner == automatic_winner
                ),
                "statistically_confirmed": all(
                    comparison["holm_adjusted_p"] < 0.05
                    and comparison["risk_difference"] > 0
                    for comparison in comparisons
                ),
                "status": "provisional_winner_confirmation_required",
            },
        }
        output_dir.mkdir(parents=True, exist_ok=True)
        write_json(output_dir / "summary.json", summary)
        (output_dir / "REPORT.md").write_text(
            self._markdown(summary), encoding="utf-8"
        )
        return summary

    @staticmethod
    def _index(
        rows: list[dict[str, Any]],
    ) -> tuple[
        dict[tuple[str, str], dict[str, Any]],
        dict[tuple[str, str, str], dict[str, Any]],
        tuple[str, ...],
    ]:
        originals: dict[tuple[str, str], dict[str, Any]] = {}
        rewrites: dict[tuple[str, str, str], dict[str, Any]] = {}
        detector_sets: set[tuple[str, ...]] = set()
        for row in rows:
            language = str(row.get("language"))
            sample_id = str(row.get("sample_id"))
            pipeline = str(row.get("pipeline"))
            if language not in {"en", "it"}:
                raise ValueError(f"Unsupported language: {language}")
            detector_sets.add(tuple(sorted((row.get("detectors") or {}).keys())))
            if pipeline == "original":
                key = (language, sample_id)
                if key in originals:
                    raise ValueError(f"Duplicate original: {key}")
                originals[key] = row
            else:
                if pipeline not in EXPECTED_PIPELINES:
                    raise ValueError(f"Unexpected pipeline: {pipeline}")
                key = (language, sample_id, pipeline)
                if key in rewrites:
                    raise ValueError(f"Duplicate rewrite: {key}")
                rewrites[key] = row
        if len(detector_sets) != 1:
            raise ValueError("Detector columns are not consistent across documents")
        expected_rewrites = len(originals) * len(EXPECTED_PIPELINES)
        if len(rewrites) != expected_rewrites:
            raise ValueError(
                f"Incomplete paired rewrite matrix: {len(rewrites)}/{expected_rewrites}"
            )
        return originals, rewrites, next(iter(detector_sets))

    @staticmethod
    def _judge_index(path: Path | None) -> dict[str, dict[str, Any]]:
        if path is None:
            return {}
        output: dict[str, dict[str, Any]] = {}
        for row in read_jsonl(path):
            key = str(row.get("candidate_key"))
            if not key or key == "None" or key in output:
                raise ValueError(f"Invalid or duplicate judge candidate_key: {key}")
            output[key] = row
        return output

    @staticmethod
    def _admit_detectors(
        originals: dict[tuple[str, str], dict[str, Any]],
        detectors: tuple[str, ...],
        calibration: dict[str, Any],
        *,
        minimum_original_tpr: float,
        minimum_original_tpr_wilson_lower: float,
        maximum_evaluation_fpr: float,
        maximum_book_fpr: float,
    ) -> dict[str, dict[str, dict[str, Any]]]:
        output: dict[str, dict[str, dict[str, Any]]] = {}
        calibration_detectors = calibration.get("detectors") or {}
        for detector in detectors:
            detector_calibration = calibration_detectors.get(detector) or {}
            output[detector] = {}
            for language in ("en", "it"):
                language_originals = [
                    row for (lang, _), row in originals.items() if lang == language
                ]
                detected = sum(
                    row["detectors"][detector].get("effective_ai_detected") is True
                    for row in language_originals
                )
                total = len(language_originals)
                interval = _wilson_interval(detected, total)
                cell = (detector_calibration.get("languages") or {}).get(language)
                if not isinstance(cell, dict):
                    raise TypeError(f"Missing calibration for {detector}/{language}")
                reasons: list[str] = []
                tpr = detected / total if total else 0.0
                if tpr < minimum_original_tpr:
                    reasons.append("original_tpr_below_minimum")
                if interval is None or interval[0] < minimum_original_tpr_wilson_lower:
                    reasons.append("original_tpr_wilson_lower_below_minimum")
                evaluation_fpr = float(cell["evaluation_fpr"])
                if evaluation_fpr > maximum_evaluation_fpr:
                    reasons.append("evaluation_fpr_above_maximum")
                stress = (cell.get("stress_evaluations") or {}).get(
                    "italian_unpublished_book"
                )
                if language == "it" and stress is not None:
                    if not bool(stress.get("complete")):
                        reasons.append("book_stress_incomplete")
                    if float(stress.get("fpr", 1.0)) > maximum_book_fpr:
                        reasons.append("book_fpr_above_maximum")
                output[detector][language] = {
                    "admitted": not reasons,
                    "rejection_reasons": reasons,
                    "original_detected": detected,
                    "original_rows": total,
                    "original_tpr": tpr,
                    "original_tpr_wilson_95pct": interval,
                    "evaluation_fpr": evaluation_fpr,
                    "book_fpr": stress.get("fpr") if stress else None,
                }
        return output

    @staticmethod
    def _outcomes(
        originals: dict[tuple[str, str], dict[str, Any]],
        rewrites: dict[tuple[str, str, str], dict[str, Any]],
        admitted: dict[str, tuple[str, ...]],
        judge: dict[str, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        output: list[dict[str, Any]] = []
        for (language, sample_id), original in sorted(originals.items()):
            detectors = admitted[language]
            eligible = bool(original.get("gate2b_target_detected")) and all(
                original["detectors"][detector].get("effective_ai_detected") is True
                for detector in detectors
            )
            if not eligible:
                continue
            for pipeline in EXPECTED_PIPELINES:
                rewrite = rewrites[(language, sample_id, pipeline)]
                candidate_key = str(rewrite.get("candidate_key"))
                target_evaded = not bool(rewrite.get("gate2b_target_detected"))
                generic_evaded = all(
                    rewrite["detectors"][detector].get("effective_ai_detected") is False
                    for detector in detectors
                )
                raw_success = target_evaded and generic_evaded
                judge_row = judge.get(candidate_key)
                if judge and judge_row is None:
                    raise ValueError(f"Missing judge result for {candidate_key}")
                output.append(
                    {
                        "language": language,
                        "sample_id": sample_id,
                        "pipeline": pipeline,
                        "candidate_key": candidate_key,
                        "target_evaded": target_evaded,
                        "generic_evaded": generic_evaded,
                        "raw_success": raw_success,
                        "automatic_quality": bool(rewrite.get("quality_pass")),
                        "llm_quality": (
                            bool(judge_row.get("llm_screen_pass"))
                            if judge_row is not None
                            else None
                        ),
                        "changed_token_ratio": rewrite.get("changed_token_ratio"),
                    }
                )
        return output

    @classmethod
    def _metrics(
        cls, outcomes: list[dict[str, Any]], *, judge_available: bool
    ) -> dict[str, Any]:
        output: dict[str, Any] = {}
        for scope in ("en", "it", "overall"):
            scoped = (
                outcomes
                if scope == "overall"
                else [row for row in outcomes if row["language"] == scope]
            )
            output[scope] = {}
            for pipeline in EXPECTED_PIPELINES:
                rows = [row for row in scoped if row["pipeline"] == pipeline]
                payload = {
                    "eligible_rows": len(rows),
                    "raw_robust_evasion": cls._rate(
                        sum(bool(row["raw_success"]) for row in rows), len(rows)
                    ),
                    "automatic_quality": cls._rate(
                        sum(
                            bool(row["raw_success"])
                            and bool(row["automatic_quality"])
                            for row in rows
                        ),
                        len(rows),
                    ),
                    "automatic_quality_pass_rate": cls._rate(
                        sum(bool(row["automatic_quality"]) for row in rows), len(rows)
                    ),
                    "mean_changed_token_ratio": (
                        sum(float(row["changed_token_ratio"]) for row in rows)
                        / len(rows)
                        if rows
                        else None
                    ),
                }
                if judge_available:
                    payload["llm_quality"] = cls._rate(
                        sum(
                            bool(row["raw_success"]) and bool(row["llm_quality"])
                            for row in rows
                        ),
                        len(rows),
                    )
                    payload["llm_quality_pass_rate"] = cls._rate(
                        sum(bool(row["llm_quality"]) for row in rows), len(rows)
                    )
                output[scope][pipeline] = payload
        return output

    @staticmethod
    def _rate(successes: int, total: int) -> dict[str, Any]:
        return {
            "successes": successes,
            "rows": total,
            "rate": successes / total if total else None,
            "rate_wilson_95pct": _wilson_interval(successes, total),
        }

    @staticmethod
    def _winner(metrics: dict[str, Any], quality_key: str) -> str:
        return min(
            EXPECTED_PIPELINES,
            key=lambda pipeline: (
                -float(metrics[pipeline][quality_key]["rate"] or 0.0),
                float(metrics[pipeline]["mean_changed_token_ratio"] or math.inf),
                pipeline,
            ),
        )

    @classmethod
    def _comparisons(
        cls,
        outcomes: list[dict[str, Any]],
        winner: str,
        *,
        quality_key: str,
        bootstrap_samples: int,
        seed: int,
    ) -> list[dict[str, Any]]:
        by_pipeline: dict[str, dict[tuple[str, str], int]] = defaultdict(dict)
        for row in outcomes:
            key = (str(row["language"]), str(row["sample_id"]))
            by_pipeline[str(row["pipeline"])][key] = int(
                bool(row["raw_success"]) and bool(row[quality_key])
            )
        comparisons = []
        for pipeline in EXPECTED_PIPELINES:
            if pipeline == winner:
                continue
            keys = sorted(by_pipeline[winner])
            winner_values = [by_pipeline[winner][key] for key in keys]
            other_values = [by_pipeline[pipeline][key] for key in keys]
            wins = sum(left > right for left, right in zip(winner_values, other_values))
            losses = sum(
                left < right for left, right in zip(winner_values, other_values)
            )
            comparison = {
                "winner": winner,
                "comparator": pipeline,
                "paired_rows": len(keys),
                "discordant_wins": wins,
                "discordant_losses": losses,
                "mcnemar_exact_p": _mcnemar_exact_p(wins, losses),
                "risk_difference": (
                    sum(winner_values) - sum(other_values)
                )
                / len(keys),
                "risk_difference_bootstrap_95pct": _stratified_bootstrap_difference(
                    keys,
                    by_pipeline[winner],
                    by_pipeline[pipeline],
                    samples=bootstrap_samples,
                    seed=seed + len(comparisons),
                ),
            }
            comparisons.append(comparison)
        _attach_holm_adjusted_p(comparisons)
        return comparisons

    @staticmethod
    def _markdown(summary: dict[str, Any]) -> str:
        lines = [
            "# Algorithm selection gate",
            "",
            f"Status: **{summary['selection']['status']}**.",
            f"Provisional winner: **{summary['selection']['provisional_winner']}**.",
            "",
            "## Detector admission",
            "",
            "| Detector | EN | IT |",
            "| --- | ---: | ---: |",
        ]
        for detector, languages in summary["detector_admission"].items():
            lines.append(
                f"| {detector} | {_admission_label(languages['en'])} | "
                f"{_admission_label(languages['it'])} |"
            )
        lines.extend(
            [
                "",
                "## Paired robust outcome",
                "",
                (
                    "A success requires the EXP target and every admitted generic "
                    "detector to be evaded on a source they all detected before "
                    "rewriting."
                ),
                "",
                "| Pipeline | Automatic quality | LLM quality sensitivity | Mean edits |",
                "| --- | ---: | ---: | ---: |",
            ]
        )
        for pipeline in EXPECTED_PIPELINES:
            metrics = summary["metrics"]["overall"][pipeline]
            automatic = _rate_label(metrics["automatic_quality"])
            llm = _rate_label(metrics.get("llm_quality"))
            lines.append(
                f"| {pipeline} | {automatic} | {llm} | "
                f"{metrics['mean_changed_token_ratio']:.1%} |"
            )
        lines.extend(
            [
                "",
                (
                    "The LLM screen is a sensitivity analysis, not human ground "
                    "truth. A fresh confirmation corpus and representative human "
                    "review remain required before promotion."
                ),
                "",
            ]
        )
        return "\n".join(lines)


def _sha256(path: Path | None) -> str | None:
    if path is None:
        return None
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _mcnemar_exact_p(wins: int, losses: int) -> float:
    discordant = wins + losses
    if discordant == 0:
        return 1.0
    tail = sum(
        math.comb(discordant, index)
        for index in range(min(wins, losses) + 1)
    ) / (2**discordant)
    return min(1.0, 2 * tail)


def _attach_holm_adjusted_p(comparisons: list[dict[str, Any]]) -> None:
    ordered = sorted(
        enumerate(comparisons), key=lambda pair: pair[1]["mcnemar_exact_p"]
    )
    running = 0.0
    count = len(ordered)
    for rank, (index, comparison) in enumerate(ordered):
        adjusted = min(1.0, (count - rank) * comparison["mcnemar_exact_p"])
        running = max(running, adjusted)
        comparisons[index]["holm_adjusted_p"] = running


def _stratified_bootstrap_difference(
    keys: list[tuple[str, str]],
    winner: dict[tuple[str, str], int],
    comparator: dict[tuple[str, str], int],
    *,
    samples: int,
    seed: int,
) -> list[float]:
    rng = random.Random(seed)
    by_language = {
        language: [key for key in keys if key[0] == language]
        for language in ("en", "it")
    }
    values = []
    for _ in range(samples):
        selected = [
            rng.choice(language_keys)
            for language_keys in by_language.values()
            for _ in language_keys
        ]
        values.append(
            sum(winner[key] - comparator[key] for key in selected) / len(selected)
        )
    values.sort()
    lower = values[int(0.025 * (samples - 1))]
    upper = values[int(0.975 * (samples - 1))]
    return [lower, upper]


def _admission_label(cell: dict[str, Any]) -> str:
    return "admitted" if cell["admitted"] else "rejected"


def _rate_label(payload: dict[str, Any] | None) -> str:
    if not payload or payload.get("rate") is None:
        return "n/a"
    return f"{payload['successes']}/{payload['rows']} ({payload['rate']:.1%})"
