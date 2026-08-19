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
    ARTIFACT_SCHEMA_VERSION = 1

    def run(
        self,
        candidates_path: Path,
        evaluations_path: Path,
        api_calls_path: Path,
        output_dir: Path,
    ) -> dict[str, Any]:
        output_dir.mkdir(parents=True, exist_ok=True)
        candidates = _read_jsonl(candidates_path)
        evaluations = _read_jsonl(evaluations_path)
        calls = {row["call_key"]: row for row in _read_jsonl(api_calls_path)}
        evaluation_by_key = {row["candidate_key"]: row for row in evaluations}
        missing = [
            row["candidate_key"]
            for row in candidates
            if row["candidate_key"] not in evaluation_by_key
        ]
        if missing:
            raise ValueError(
                f"Missing remote evaluations for {len(missing)} candidates"
            )
        rows = [
            {**candidate, **evaluation_by_key[candidate["candidate_key"]]}
            for candidate in candidates
        ]

        surrogate = self._fit_surrogate(rows)
        held_out = [row for row in rows if row["attack_split"] == "held_out_test"]
        fixed = self._fixed_budget_metrics(held_out, calls)
        selected = self._select_progressive(held_out, surrogate)
        progressive = self._progressive_metrics(selected, calls, held_out)
        summary = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "benchmark_scope": "official_markllm_held_out_attack_evaluation",
            "target_fpr": 0.01,
            "candidate_count": len(rows),
            "development_candidate_count": len(rows) - len(held_out),
            "held_out_candidate_count": len(held_out),
            "independent_held_out_source_prompts": len(
                {row["sample_id"] for row in held_out}
            ),
            "surrogate": surrogate,
            "fixed_budget_cells": fixed,
            "progressive_cells": progressive,
            "human_evaluation_status": "pending",
            "human_evaluation_artifact": "human-review.csv",
            "boundaries": [
                "Target detector thresholds were calibrated on independent clean generations.",
                "Surrogate thresholds were fitted on the development split only.",
                "All headline attack metrics use held-out source prompts only.",
                (
                    "A candidate counts as quality-passing only if deterministic protected-span, "
                    "multilingual semantic-similarity, and bidirectional-NLI gates all pass."
                ),
                (
                    "This benchmark evaluates reproduced MarkLLM schemes, not Claude or any "
                    "undisclosed production watermark."
                ),
            ],
        }
        _write_json(output_dir / "summary.json", summary)
        _write_jsonl(output_dir / "progressive-selections.jsonl", selected)
        self._write_human_review(selected, output_dir)
        (output_dir / "REPORT.md").write_text(
            self._render_markdown(summary), encoding="utf-8"
        )
        return summary

    def _fit_surrogate(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            if row["attack_split"] == "development":
                groups[(row["pipeline"], row["algorithm"], row["language"])].append(row)
        cells = []
        for (pipeline, algorithm, language), items in sorted(groups.items()):
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
            best = max(scored)
            cells.append(
                {
                    "pipeline": pipeline,
                    "algorithm": algorithm,
                    "language": language,
                    "feature": "self_information_retention",
                    "pass_rule": "all quality gates pass and retention <= threshold",
                    "threshold": best[4],
                    "development_candidates": len(items),
                    "development_initially_detected_candidates": len(eligible),
                    "development_evasion_prevalence": _mean(
                        not row["target_detected"] for row in eligible
                    ),
                    "development_precision": best[1],
                    "development_recall": best[2],
                    "development_f1": best[0],
                    "confusion": {
                        "tp": best[5],
                        "fp": best[6],
                        "tn": best[7],
                        "fn": best[8],
                    },
                }
            )
        return {
            "fit_split": "development",
            "evaluation_split": "held_out_test",
            "target_label_used_for_fit_only": True,
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
            (cell["pipeline"], cell["algorithm"], cell["language"]): cell["threshold"]
            for cell in surrogate["cells"]
        }
        groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            groups[(row["case_key"], row["pipeline"])].append(row)
        selected = []
        for (_, pipeline), items in sorted(groups.items()):
            ordered = sorted(items, key=lambda row: float(row["budget_ratio"]))
            key = (pipeline, ordered[0]["algorithm"], ordered[0]["language"])
            threshold = thresholds[key]
            chosen = ordered[-1]
            stopped_on_pass = False
            attempted = []
            for row in ordered:
                attempted.append(row["candidate_key"])
                surrogate_pass = (
                    bool(row["quality_pass"])
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
