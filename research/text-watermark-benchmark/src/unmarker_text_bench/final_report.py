from __future__ import annotations

import csv
import hashlib
import json
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path
from statistics import mean
from typing import Any


class FinalReportRunner:
    ARTIFACT_SCHEMA_VERSION = 3
    SURROGATE_PRECISION_FLOOR = 0.80

    def run(
        self,
        candidates_path: Path,
        evaluations_path: Path,
        api_calls_path: Path,
        output_dir: Path,
        baselines_path: Path | None = None,
        judge_evaluations_path: Path | None = None,
    ) -> dict[str, Any]:
        output_dir.mkdir(parents=True, exist_ok=True)
        candidates = _read_jsonl(candidates_path)
        baselines = _read_jsonl(baselines_path) if baselines_path else []
        evaluations = _read_jsonl(evaluations_path)
        calls = {row["call_key"]: row for row in _read_jsonl(api_calls_path)}
        evaluation_by_key = {row["candidate_key"]: row for row in evaluations}
        missing = [
            row["candidate_key"]
            for row in [*candidates, *baselines]
            if row["candidate_key"] not in evaluation_by_key
        ]
        if missing:
            raise ValueError(
                f"Missing remote evaluations for {len(missing)} candidates"
            )
        rows = [
            self._merge_evaluation(
                candidate,
                evaluation_by_key[candidate["candidate_key"]],
                calls,
            )
            for candidate in candidates
        ]
        baseline_rows = [
            self._merge_evaluation(
                baseline,
                evaluation_by_key[baseline["candidate_key"]],
                calls,
            )
            for baseline in baselines
        ]

        surrogate = self._fit_surrogate(rows)
        held_out = [row for row in rows if row["attack_split"] == "held_out_test"]
        fixed = self._fixed_budget_metrics(held_out, calls)
        selected = self._select_progressive(held_out, surrogate)
        judge_summary = self._judge_summary(selected, judge_evaluations_path)
        progressive = self._progressive_metrics(selected, calls, held_out)
        held_out_baselines = [
            row for row in baseline_rows if row["attack_split"] == "held_out_test"
        ]
        oracle_pool = [
            row
            for row in held_out_baselines
            if row["artifact_kind"] == "adaptive_oracle_attempt"
        ]
        oracle_selected = self._select_oracle(oracle_pool)
        oracle_cells = self._oracle_metrics(oracle_selected, calls, oracle_pool)
        restamp_rows = [
            row
            for row in held_out_baselines
            if row["artifact_kind"] == "restamp_control"
        ]
        restamp_cells = self._restamp_metrics(restamp_rows, calls)
        summary = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "benchmark_scope": "official_markllm_held_out_attack_evaluation",
            "target_fpr": 0.01,
            "candidate_count": len(rows),
            "development_candidate_count": len(rows) - len(held_out),
            "held_out_candidate_count": len(held_out),
            "baseline_count": len(baseline_rows),
            "held_out_baseline_count": len(held_out_baselines),
            "incomplete_api_output_candidate_count": sum(
                not row["api_output_complete"] for row in rows
            ),
            "incomplete_api_output_baseline_count": sum(
                not row["api_output_complete"] for row in baseline_rows
            ),
            "independent_held_out_source_prompts": len(
                {row["sample_id"] for row in held_out}
            ),
            "surrogate": surrogate,
            "fixed_budget_cells": fixed,
            "progressive_cells": progressive,
            "llm_quality_prescreen": judge_summary,
            "adaptive_oracle": {
                "role": "target-detector adaptive upper-bound baseline, not a candidate algorithm",
                "selection_uses_target_detector": True,
                "max_attempts": max(
                    (int(row["attempt"]) for row in oracle_pool), default=0
                ),
                "held_out_attempt_pool_size": len(oracle_pool),
                "cells": oracle_cells,
                "observed_precomputed_pool": self._cost_summary(oracle_pool, calls),
                "simulated_adaptive_queries": self._cost_summary(
                    [
                        row
                        for selection in oracle_selected
                        for row in oracle_pool
                        if row["candidate_key"] in selection["attempted_candidate_keys"]
                    ],
                    calls,
                ),
            },
            "restamp_control": {
                "role": "clean-text paraphrase control for false-positive introduction",
                "cells": restamp_cells,
                "held_out_rows": len(restamp_rows),
                "observed_cost": self._cost_summary(restamp_rows, calls),
            },
            "human_evaluation_status": "pending",
            "human_evaluation_artifact": "human-review.csv",
            "boundaries": [
                "Target detector thresholds were calibrated on independent clean generations.",
                "Surrogate thresholds were fitted on the development split only.",
                "All headline attack metrics use held-out source prompts only.",
                (
                    "The adaptive-oracle paraphrase uses held-out target-detector outcomes for "
                    "stopping and is reported only as an upper-bound baseline, never ranked as "
                    "a candidate algorithm."
                ),
                (
                    "The re-stamp control paraphrases clean model output and measures whether "
                    "rewriting introduces target-detector false positives."
                ),
                (
                    "A candidate counts as quality-passing only if deterministic protected-span, "
                    "multilingual semantic-similarity, and bidirectional-NLI gates all pass."
                ),
                (
                    "Any candidate backed by an API call whose finish_reason is not stop is "
                    "forced to fail the quality gate and counted separately."
                ),
                (
                    "This benchmark evaluates reproduced MarkLLM schemes, not Claude or any "
                    "undisclosed production watermark."
                ),
            ],
        }
        _write_json(output_dir / "summary.json", summary)
        _write_jsonl(output_dir / "progressive-selections.jsonl", selected)
        _write_jsonl(output_dir / "adaptive-oracle-selections.jsonl", oracle_selected)
        self._write_human_review(selected, output_dir)
        (output_dir / "REPORT.md").write_text(
            self._render_markdown(summary), encoding="utf-8"
        )
        return summary

    @staticmethod
    def _merge_evaluation(
        artifact: dict[str, Any],
        evaluation: dict[str, Any],
        calls: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        missing_calls = [
            call_key for call_key in artifact["api_call_keys"] if call_key not in calls
        ]
        if missing_calls:
            raise ValueError(
                f"Missing API records for {artifact['candidate_key']}: {missing_calls}"
            )
        incomplete_calls = [
            call_key
            for call_key in artifact["api_call_keys"]
            if calls[call_key].get("finish_reason") not in {None, "stop"}
        ]
        merged = {
            **artifact,
            **evaluation,
            "remote_quality_pass_before_api_completion_gate": bool(
                evaluation["quality_pass"]
            ),
            "api_output_complete": not incomplete_calls,
            "incomplete_api_call_keys": incomplete_calls,
        }
        if incomplete_calls:
            merged["quality_pass"] = False
        return merged

    @staticmethod
    def _judge_summary(
        selected: list[dict[str, Any]], judge_path: Path | None
    ) -> dict[str, Any]:
        if judge_path is None:
            return {
                "status": "pending",
                "role": "quality pre-screen only; never an attack-success oracle",
            }
        judgments = _read_jsonl(judge_path)
        by_key = {row["candidate_key"]: row for row in judgments}
        missing = [
            row["candidate_key"]
            for row in selected
            if row["candidate_key"] not in by_key
        ]
        if missing:
            raise ValueError(
                f"Missing LLM judgments for {len(missing)} progressive selections"
            )
        joined = [{**row, **by_key[row["candidate_key"]]} for row in selected]
        return {
            "status": "complete",
            "role": "quality pre-screen only; never an attack-success oracle",
            "candidates": len(joined),
            "pass_rate": _mean(row["llm_screen_pass"] for row in joined),
            "material_error_rate": _mean(row["material_error"] for row in joined),
            "deterministic_llm_disagreements": sum(
                bool(row["quality_pass"]) != bool(row["llm_screen_pass"])
                for row in joined
            ),
            "mean_fluency": mean(float(row["fluency_score"]) for row in joined),
            "mean_naturalness": mean(float(row["naturalness_score"]) for row in joined),
        }

    def _select_oracle(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            groups[row["case_key"]].append(row)
        selected = []
        for _, items in sorted(groups.items()):
            ordered = sorted(items, key=lambda row: int(row["attempt"]))
            chosen = ordered[-1]
            attempted = []
            success = False
            for row in ordered:
                attempted.append(row["candidate_key"])
                if bool(row["quality_pass"]) and not bool(row["target_detected"]):
                    chosen = row
                    success = True
                    break
            selected.append(
                {
                    **chosen,
                    "oracle_success": success,
                    "attempted_candidate_keys": attempted,
                }
            )
        return selected

    def _oracle_metrics(
        self,
        selected: list[dict[str, Any]],
        calls: dict[str, dict[str, Any]],
        pool: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        by_key = {row["candidate_key"]: row for row in pool}
        groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in selected:
            groups[(row["algorithm"], row["language"])].append(row)
        cells = []
        for (algorithm, language), items in sorted(groups.items()):
            attempted_calls = [
                call_key
                for item in items
                for candidate_key in item["attempted_candidate_keys"]
                for call_key in by_key[candidate_key]["api_call_keys"]
            ]
            cell = self._metric_cell(
                items,
                calls,
                "adaptive_oracle_paraphrase",
                "target-oracle",
                algorithm,
                language,
                call_keys=attempted_calls,
            )
            cell.update(
                {
                    "oracle_success_rate": _mean(
                        row["oracle_success"] for row in items
                    ),
                    "mean_queries": mean(
                        len(row["attempted_candidate_keys"]) for row in items
                    ),
                    "selected_attempt_distribution": _counts(
                        str(row["attempt"]) for row in items
                    ),
                }
            )
            cells.append(cell)
        return cells

    def _restamp_metrics(
        self,
        rows: list[dict[str, Any]],
        calls: dict[str, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            groups[(row["algorithm"], row["language"])].append(row)
        cells = []
        for (algorithm, language), items in sorted(groups.items()):
            initially_negative = [row for row in items if not row["preattack_detected"]]
            cost = self._cost_summary(items, calls)
            cells.append(
                {
                    "pipeline": "restamp_control",
                    "algorithm": algorithm,
                    "language": language,
                    "independent_source_prompts": len(
                        {row["sample_id"] for row in items}
                    ),
                    "clean_fpr_before": _mean(
                        row["preattack_detected"] for row in items
                    ),
                    "clean_fpr_after": _mean(row["target_detected"] for row in items),
                    "false_positive_introduction_rate": _mean(
                        row["target_detected"] for row in initially_negative
                    ),
                    "quality_pass_rate": _mean(row["quality_pass"] for row in items),
                    "mean_changed_token_ratio": mean(
                        float(row["changed_token_ratio"]) for row in items
                    ),
                    **cost,
                }
            )
        return cells

    @staticmethod
    def _cost_summary(
        rows: list[dict[str, Any]], calls: dict[str, dict[str, Any]]
    ) -> dict[str, Any]:
        call_keys = list(
            dict.fromkeys(key for row in rows for key in row["api_call_keys"])
        )
        relevant = [calls[key] for key in call_keys]
        tokens = sum(
            int(call["prompt_tokens"]) + int(call["completion_tokens"])
            for call in relevant
        )
        cost = sum(float(call["cost_usd"] or 0.0) for call in relevant)
        return {
            "openrouter_api_calls": len(relevant),
            "openrouter_cost_usd": cost,
            "openrouter_cost_per_1k_tokens_usd": (
                cost * 1000 / tokens if tokens else None
            ),
            "openrouter_latency_ms": sum(
                float(call["latency_ms"]) for call in relevant
            ),
        }

    def _fit_surrogate(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            if row["attack_split"] == "development":
                groups[(row["algorithm"], row["language"])].append(row)
        cells = []
        for (algorithm, language), items in sorted(groups.items()):
            eligible = [row for row in items if row["preattack_detected"]]
            thresholds = sorted(
                {float(row["self_information_retention"]) for row in eligible}
            )
            candidates = [-1.0, *thresholds]
            scored = []
            for threshold in candidates:
                tp = fp = tn = fn = 0
                for row in eligible:
                    predicted = (
                        row["quality_pass"]
                        and float(row["self_information_retention"]) <= threshold
                    )
                    actual = not bool(row["target_detected"])
                    if predicted and actual:
                        tp += 1
                    elif predicted:
                        fp += 1
                    elif actual:
                        fn += 1
                    else:
                        tn += 1
                precision = tp / (tp + fp) if tp + fp else 0.0
                recall = tp / (tp + fn) if tp + fn else 0.0
                f1 = (
                    2 * precision * recall / (precision + recall)
                    if precision + recall
                    else 0.0
                )
                scored.append(
                    (f1, precision, recall, -threshold, threshold, tp, fp, tn, fn)
                )
            admissible = [
                value
                for value in scored
                if value[5] + value[6] > 0
                and value[1] >= self.SURROGATE_PRECISION_FLOOR
            ]
            best = (
                max(
                    admissible,
                    key=lambda value: (value[2], value[0], value[1], value[3]),
                )
                if admissible
                else None
            )
            cells.append(
                {
                    "algorithm": algorithm,
                    "language": language,
                    "scope": "shared_across_candidate_pipelines",
                    "pipelines": sorted({row["pipeline"] for row in items}),
                    "feature": "self_information_retention",
                    "pass_rule": "all quality gates pass and retention <= threshold",
                    "precision_floor": self.SURROGATE_PRECISION_FLOOR,
                    "enabled": best is not None,
                    "disabled_reason": (
                        None
                        if best is not None
                        else "no development threshold met the precision floor"
                    ),
                    "threshold": best[4] if best is not None else None,
                    "development_candidates": len(items),
                    "development_initially_detected_candidates": len(eligible),
                    "development_evasion_prevalence": _mean(
                        not row["target_detected"] for row in eligible
                    ),
                    "development_precision": best[1] if best is not None else None,
                    "development_recall": best[2] if best is not None else None,
                    "development_f1": best[0] if best is not None else None,
                    "confusion": (
                        {
                            "tp": best[5],
                            "fp": best[6],
                            "tn": best[7],
                            "fn": best[8],
                        }
                        if best is not None
                        else None
                    ),
                }
            )
        return {
            "fit_split": "development",
            "evaluation_split": "held_out_test",
            "target_label_used_for_fit_only": True,
            "grouping": "one threshold per algorithm and language, shared by all pipelines",
            "precision_floor": self.SURROGATE_PRECISION_FLOOR,
            "cells": cells,
        }

    def _fixed_budget_metrics(
        self,
        rows: list[dict[str, Any]],
        calls: dict[str, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        groups: dict[tuple[str, str, str, str], list[dict[str, Any]]] = defaultdict(
            list
        )
        for row in rows:
            groups[
                (row["pipeline"], row["budget"], row["algorithm"], row["language"])
            ].append(row)
        return [
            self._metric_cell(items, calls, pipeline, budget, algorithm, language)
            for (pipeline, budget, algorithm, language), items in sorted(groups.items())
        ]

    def _select_progressive(
        self,
        rows: list[dict[str, Any]],
        surrogate: dict[str, Any],
    ) -> list[dict[str, Any]]:
        thresholds = {
            (cell["algorithm"], cell["language"]): cell["threshold"]
            for cell in surrogate["cells"]
        }
        groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            groups[(row["case_key"], row["pipeline"])].append(row)
        selected = []
        for (_, pipeline), items in sorted(groups.items()):
            ordered = sorted(items, key=lambda row: float(row["budget_ratio"]))
            key = (ordered[0]["algorithm"], ordered[0]["language"])
            threshold = thresholds[key]
            chosen = ordered[-1]
            stopped_on_pass = False
            attempted = []
            for row in ordered:
                attempted.append(row["candidate_key"])
                surrogate_pass = (
                    threshold is not None
                    and bool(row["quality_pass"])
                    and float(row["self_information_retention"]) <= threshold
                )
                if surrogate_pass:
                    chosen = row
                    stopped_on_pass = True
                    break
            selected.append(
                {
                    **chosen,
                    "surrogate_threshold": threshold,
                    "surrogate_pass": stopped_on_pass,
                    "attempted_candidate_keys": attempted,
                }
            )
        return selected

    def _progressive_metrics(
        self,
        selected: list[dict[str, Any]],
        calls: dict[str, dict[str, Any]],
        all_rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        candidate_by_key = {row["candidate_key"]: row for row in all_rows}
        groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in selected:
            groups[(row["pipeline"], row["algorithm"], row["language"])].append(row)
        cells = []
        for (pipeline, algorithm, language), items in sorted(groups.items()):
            attempted_calls = []
            for item in items:
                for candidate_key in item["attempted_candidate_keys"]:
                    attempted_calls.extend(
                        candidate_by_key[candidate_key]["api_call_keys"]
                    )
            cell = self._metric_cell(
                items,
                calls,
                pipeline,
                "progressive",
                algorithm,
                language,
                call_keys=attempted_calls,
            )
            cell.update(
                {
                    "surrogate_pass_rate": _mean(
                        row["surrogate_pass"] for row in items
                    ),
                    "selected_budget_distribution": _counts(
                        row["budget"] for row in items
                    ),
                    "mean_attempted_budgets": mean(
                        len(row["attempted_candidate_keys"]) for row in items
                    ),
                }
            )
            cells.append(cell)
        return cells

    def _metric_cell(
        self,
        items: list[dict[str, Any]],
        calls: dict[str, dict[str, Any]],
        pipeline: str,
        budget: str,
        algorithm: str,
        language: str,
        call_keys: list[str] | None = None,
    ) -> dict[str, Any]:
        initially_detected = [row for row in items if row["preattack_detected"]]
        relevant_call_keys = list(
            dict.fromkeys(
                call_keys
                if call_keys is not None
                else [key for row in items for key in row["api_call_keys"]]
            )
        )
        relevant_calls = [calls[key] for key in relevant_call_keys]
        total_tokens = sum(
            int(call["prompt_tokens"]) + int(call["completion_tokens"])
            for call in relevant_calls
        )
        total_cost = sum(float(call["cost_usd"] or 0.0) for call in relevant_calls)
        return {
            "pipeline": pipeline,
            "budget": budget,
            "algorithm": algorithm,
            "language": language,
            "independent_source_prompts": len({row["sample_id"] for row in items}),
            "candidates": len(items),
            "preattack_tpr_at_1pct_fpr": _mean(
                row["preattack_detected"] for row in items
            ),
            "postattack_tpr_at_1pct_fpr": _mean(
                row["target_detected"] for row in items
            ),
            "conditional_evasion_rate": _mean(
                not row["target_detected"] for row in initially_detected
            ),
            "quality_preserving_conditional_evasion_rate": _mean(
                (not row["target_detected"]) and row["quality_pass"]
                for row in initially_detected
            ),
            "quality_pass_rate": _mean(row["quality_pass"] for row in items),
            "mean_changed_token_ratio": mean(
                float(row["changed_token_ratio"]) for row in items
            ),
            "mean_token_edit_distance": mean(
                float(row["token_edit_distance"]) for row in items
            ),
            "exact_entity_preservation_rate": _mean(
                row["deterministic_quality"]["entities_preserved"] for row in items
            ),
            "exact_number_preservation_rate": _mean(
                row["deterministic_quality"]["numbers_preserved"] for row in items
            ),
            "mean_semantic_similarity": mean(
                float(row["semantic_similarity"]) for row in items
            ),
            "mean_bidirectional_entailment": mean(
                float(row["bidirectional_entailment"]) for row in items
            ),
            "openrouter_api_calls": len(relevant_calls),
            "openrouter_cost_usd": total_cost,
            "openrouter_cost_per_1k_tokens_usd": (
                total_cost * 1000 / total_tokens if total_tokens else None
            ),
            "openrouter_latency_ms": sum(
                float(call["latency_ms"]) for call in relevant_calls
            ),
        }

    @staticmethod
    def _write_human_review(selected: list[dict[str, Any]], output_dir: Path) -> None:
        review_rows = []
        key = []
        ordered = sorted(
            selected,
            key=lambda row: hashlib.blake2b(
                row["candidate_key"].encode("utf-8"), digest_size=8
            ).digest(),
        )
        for index, row in enumerate(ordered, start=1):
            review_id = f"review-{index:05d}"
            review_rows.append(
                {
                    "review_id": review_id,
                    "language": row["language"],
                    "original_text": row["original_text"],
                    "candidate_text": row["candidate_text"],
                    "meaning_preservation_1_to_5": "",
                    "fluency_1_to_5": "",
                    "factual_or_polarity_error": "",
                    "notes": "",
                }
            )
            key.append({"review_id": review_id, "candidate_key": row["candidate_key"]})
        with (output_dir / "human-review.csv").open(
            "w", newline="", encoding="utf-8"
        ) as handle:
            writer = csv.DictWriter(
                handle, fieldnames=list(review_rows[0]) if review_rows else []
            )
            if review_rows:
                writer.writeheader()
                writer.writerows(review_rows)
        _write_json(output_dir / "human-review-key.json", {"rows": key})

    @staticmethod
    def _render_markdown(summary: dict[str, Any]) -> str:
        lines = [
            "# MarkLLM attack benchmark",
            "",
            f"Evidence scope: `{summary['benchmark_scope']}`.",
            "",
            f"Held-out independent prompts: {summary['independent_held_out_source_prompts']}.",
            "Human evaluation is pending; no algorithm should be promoted before it is complete.",
            "",
            "## Progressive held-out results",
            "",
            "| Pipeline | Watermark | Lang | TPR before | TPR after | Conditional evasion | Quality pass | Mean edits | Cost (USD) |",
            "|---|---|---:|---:|---:|---:|---:|---:|---:|",
        ]
        for cell in summary["progressive_cells"]:
            lines.append(
                "| {pipeline} | {algorithm} | {language} | {pre:.1%} | {post:.1%} | "
                "{evasion:.1%} | {quality:.1%} | {edits:.1%} | {cost:.4f} |".format(
                    pipeline=cell["pipeline"],
                    algorithm=cell["algorithm"],
                    language=cell["language"],
                    pre=cell["preattack_tpr_at_1pct_fpr"],
                    post=cell["postattack_tpr_at_1pct_fpr"],
                    evasion=cell["conditional_evasion_rate"],
                    quality=cell["quality_pass_rate"],
                    edits=cell["mean_changed_token_ratio"],
                    cost=cell["openrouter_cost_usd"],
                )
            )
        lines.extend(
            [
                "",
                "## Adaptive target-oracle baseline",
                "",
                "This is an upper-bound baseline: target-detector outcomes choose when to stop. It is not a candidate algorithm.",
                "",
                "| Watermark | Lang | TPR before | TPR after | Oracle success | Mean queries | Quality pass | Cost (USD) |",
                "|---|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for cell in summary["adaptive_oracle"]["cells"]:
            lines.append(
                "| {algorithm} | {language} | {pre:.1%} | {post:.1%} | "
                "{success:.1%} | {queries:.2f} | {quality:.1%} | {cost:.4f} |".format(
                    algorithm=cell["algorithm"],
                    language=cell["language"],
                    pre=cell["preattack_tpr_at_1pct_fpr"],
                    post=cell["postattack_tpr_at_1pct_fpr"],
                    success=cell["oracle_success_rate"],
                    queries=cell["mean_queries"],
                    quality=cell["quality_pass_rate"],
                    cost=cell["openrouter_cost_usd"],
                )
            )
        lines.extend(
            [
                "",
                "## Clean re-stamp control",
                "",
                "| Watermark | Lang | Clean FPR before | Clean FPR after | Introduced FP | Quality pass |",
                "|---|---:|---:|---:|---:|---:|",
            ]
        )
        for cell in summary["restamp_control"]["cells"]:
            lines.append(
                "| {algorithm} | {language} | {before:.1%} | {after:.1%} | "
                "{introduced:.1%} | {quality:.1%} |".format(
                    algorithm=cell["algorithm"],
                    language=cell["language"],
                    before=cell["clean_fpr_before"],
                    after=cell["clean_fpr_after"],
                    introduced=cell["false_positive_introduction_rate"],
                    quality=cell["quality_pass_rate"],
                )
            )
        lines.extend(
            [
                "",
                "## Boundaries",
                "",
                *[f"- {value}" for value in summary["boundaries"]],
                "",
            ]
        )
        return "\n".join(lines)


def _mean(values: Iterable[Any]) -> float:
    items = [float(value) for value in values]
    return sum(items) / len(items) if items else 0.0


def _counts(values: Iterable[str]) -> dict[str, int]:
    result: dict[str, int] = defaultdict(int)
    for value in values:
        result[value] += 1
    return dict(sorted(result.items()))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}") from error
    return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
