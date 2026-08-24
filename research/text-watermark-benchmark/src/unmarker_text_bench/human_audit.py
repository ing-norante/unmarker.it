from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import re
import shutil
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable
from pathlib import Path
from statistics import mean
from typing import Any

from .number_context import number_context_conflicts

RATING_FIELDS = (
    "meaning_preservation_1_to_5",
    "fluency_1_to_5",
)
FLAG_FIELD = "factual_or_polarity_error"
REQUIRED_FIELDS = (
    "review_id",
    "language",
    "candidate_text",
    *RATING_FIELDS,
    FLAG_FIELD,
    "notes",
)
IMMUTABLE_FIELDS = ("review_id", "language", "candidate_text")
VALID_RATINGS = {"1", "2", "3", "4", "5"}
VALID_FLAGS = {"true", "false"}
ADJUDICATION_RATING_FIELDS = (
    "adjudicated_meaning_1_to_5",
    "adjudicated_fluency_1_to_5",
)
ADJUDICATION_FLAG_FIELD = "adjudicated_factual_or_polarity_error"
ADJUDICATION_NOTES_FIELD = "adjudication_notes"


class HumanAuditRunner:
    ARTIFACT_SCHEMA_VERSION = 2

    def __init__(
        self,
        minimum_meaning: int = 4,
        minimum_fluency: int = 4,
        balanced_core_size: int = 24,
        secondary_random_size: int = 6,
        secondary_seed: int = 20260824,
    ) -> None:
        if minimum_meaning not in range(1, 6):
            raise ValueError("minimum_meaning must be between 1 and 5")
        if minimum_fluency not in range(1, 6):
            raise ValueError("minimum_fluency must be between 1 and 5")
        if balanced_core_size < 1:
            raise ValueError("balanced_core_size must be positive")
        if secondary_random_size < 0:
            raise ValueError("secondary_random_size cannot be negative")
        self.minimum_meaning = minimum_meaning
        self.minimum_fluency = minimum_fluency
        self.balanced_core_size = balanced_core_size
        self.secondary_random_size = secondary_random_size
        self.secondary_seed = secondary_seed

    def run(
        self,
        reviewed_audit_path: Path,
        audit_template_path: Path,
        audit_key_path: Path,
        selections_path: Path,
        output_dir: Path,
        judge_evaluations_path: Path | None = None,
        report_summary_path: Path | None = None,
        secondary_reviewed_path: Path | None = None,
        adjudicated_audit_path: Path | None = None,
    ) -> dict[str, Any]:
        if adjudicated_audit_path is not None and secondary_reviewed_path is None:
            raise ValueError("--adjudicated-audit requires --secondary-reviewed")
        reviewed, reviewed_fields = _read_csv(reviewed_audit_path)
        template, template_fields = _read_csv(audit_template_path)
        source_column = _source_column(reviewed_fields)
        if source_column != _source_column(template_fields):
            raise ValueError("Reviewed audit and template use different source columns")
        self._validate_primary(reviewed, reviewed_fields, template, template_fields)

        key_rows = _read_key(audit_key_path)
        key_by_review = _unique_by(key_rows, "review_id", "audit key")
        selection_rows = _read_jsonl(selections_path)
        selections = _unique_by(selection_rows, "candidate_key", "selections")
        judges = (
            _unique_by(
                _read_jsonl(judge_evaluations_path),
                "candidate_key",
                "judge evaluations",
            )
            if judge_evaluations_path
            else {}
        )

        joined = self._join(
            reviewed,
            key_by_review,
            selections,
            judges,
            source_column,
        )
        number_context_population = self._number_context_population_reanalysis(
            selection_rows
        )
        output_dir.mkdir(parents=True, exist_ok=True)
        snapshot_path = output_dir / "manual-audit.reviewed.csv"
        if reviewed_audit_path.resolve() != snapshot_path.resolve():
            shutil.copyfile(reviewed_audit_path, snapshot_path)
        _write_jsonl(output_dir / "human-audit.joined.jsonl", joined)

        second_template_path = output_dir / "second-review.csv"
        if (
            secondary_reviewed_path is not None
            and secondary_reviewed_path.resolve() == second_template_path.resolve()
        ):
            raise ValueError(
                "--secondary-reviewed must point to an exported reviewed copy, "
                "not the generated second-review.csv template"
            )
        secondary = self._write_secondary_review(
            joined,
            reviewed_fields,
            output_dir,
            source_column,
        )
        secondary_agreement = None
        adjudication = None
        if secondary_reviewed_path is not None:
            secondary_agreement = self._secondary_agreement(
                secondary_reviewed_path,
                second_template_path,
                output_dir / "second-review-key.json",
                joined,
                output_dir,
                source_column,
            )
            if adjudicated_audit_path is not None:
                adjudication_template_path = output_dir / "adjudication.csv"
                if (
                    adjudicated_audit_path.resolve()
                    == adjudication_template_path.resolve()
                ):
                    raise ValueError(
                        "--adjudicated-audit must point to an exported reviewed "
                        "copy, not the generated adjudication.csv template"
                    )
                adjudication = self._adjudication(
                    adjudicated_audit_path,
                    adjudication_template_path,
                    secondary_reviewed_path,
                    second_template_path,
                    output_dir / "second-review-key.json",
                    joined,
                    output_dir,
                    source_column,
                )

        summary = self._summary(
            joined,
            reviewed_audit_path,
            audit_template_path,
            audit_key_path,
            selections_path,
            judge_evaluations_path,
            secondary,
            secondary_agreement,
            adjudication,
            number_context_population,
        )
        _write_json(output_dir / "human-audit.summary.json", summary)
        (output_dir / "HUMAN_AUDIT.md").write_text(
            self._render_markdown(summary), encoding="utf-8"
        )
        if report_summary_path is not None:
            self._update_report_summary(report_summary_path, output_dir, summary)
        return summary

    def _validate_primary(
        self,
        reviewed: list[dict[str, str]],
        reviewed_fields: list[str],
        template: list[dict[str, str]],
        template_fields: list[str],
    ) -> None:
        missing = [field for field in REQUIRED_FIELDS if field not in reviewed_fields]
        if missing:
            raise ValueError(f"Reviewed audit is missing columns: {missing}")
        if reviewed_fields != template_fields:
            raise ValueError("Reviewed audit column order differs from its template")
        if len(reviewed) != len(template):
            raise ValueError("Reviewed audit row count differs from its template")
        if not reviewed:
            raise ValueError("Reviewed audit is empty")

        source_column = _source_column(reviewed_fields)
        immutable = (*IMMUTABLE_FIELDS, source_column)
        identifiers = set()
        for index, (row, expected) in enumerate(
            zip(reviewed, template, strict=True), start=2
        ):
            review_id = row["review_id"]
            if review_id in identifiers:
                raise ValueError(f"Duplicate review_id at CSV row {index}: {review_id}")
            identifiers.add(review_id)
            if any(row[field] != expected[field] for field in immutable):
                raise ValueError(
                    f"Blind input fields changed at CSV row {index}: {review_id}"
                )
            for field in RATING_FIELDS:
                if row[field].strip() not in VALID_RATINGS:
                    raise ValueError(
                        f"Invalid or missing {field} at CSV row {index}: {review_id}"
                    )
            if row[FLAG_FIELD].strip().lower() not in VALID_FLAGS:
                raise ValueError(
                    f"Invalid or missing {FLAG_FIELD} at CSV row {index}: {review_id}"
                )

    def _join(
        self,
        reviewed: list[dict[str, str]],
        key_by_review: dict[str, dict[str, Any]],
        selections: dict[str, dict[str, Any]],
        judges: dict[str, dict[str, Any]],
        source_column: str,
    ) -> list[dict[str, Any]]:
        if set(key_by_review) != {row["review_id"] for row in reviewed}:
            raise ValueError(
                "Audit key review IDs do not exactly match the reviewed CSV"
            )
        joined = []
        for index, human in enumerate(reviewed):
            key = key_by_review[human["review_id"]]
            candidate_key = str(key["candidate_key"])
            if candidate_key not in selections:
                raise ValueError(f"Missing progressive selection: {candidate_key}")
            if judges and candidate_key not in judges:
                raise ValueError(f"Missing judge evaluation: {candidate_key}")
            selection = selections[candidate_key]
            if (
                selection["language"] != human["language"]
                or selection["original_text"] != human[source_column]
                or selection["candidate_text"] != human["candidate_text"]
            ):
                raise ValueError(
                    f"Blind audit content does not match selection: {candidate_key}"
                )
            meaning = int(human[RATING_FIELDS[0]])
            fluency = int(human[RATING_FIELDS[1]])
            material_error = human[FLAG_FIELD].strip().lower() == "true"
            human_pass = (
                meaning >= self.minimum_meaning
                and fluency >= self.minimum_fluency
                and not material_error
            )
            context_conflicts = number_context_conflicts(
                human[source_column], human["candidate_text"], human["language"]
            )
            selection_stage, stage_source = self._selection_stage(key, index)
            row = {
                "review_id": human["review_id"],
                "candidate_key": candidate_key,
                "selection_stage": selection_stage,
                "selection_stage_source": stage_source,
                "selection_reason": key.get("selection_reason", "unknown"),
                "language": selection["language"],
                "source_text": human[source_column],
                "candidate_text": human["candidate_text"],
                "algorithm": selection["algorithm"],
                "pipeline": selection["pipeline"],
                "budget": selection["budget"],
                "sample_id": selection["sample_id"],
                "human_meaning": meaning,
                "human_fluency": fluency,
                "human_material_error": material_error,
                "human_notes": human["notes"],
                "human_quality_pass": human_pass,
                "preattack_detected": bool(selection["preattack_detected"]),
                "target_detected": bool(selection["target_detected"]),
                "human_quality_preserving_evasion": (
                    human_pass
                    and bool(selection["preattack_detected"])
                    and not bool(selection["target_detected"])
                ),
                "changed_token_ratio": float(selection["changed_token_ratio"]),
                "combined_quality_gate_pass": bool(selection["quality_pass"]),
                "deterministic_quality_pass": bool(
                    selection.get(
                        "deterministic_quality_pass", selection["quality_pass"]
                    )
                ),
                "deterministic_failure_reasons": selection.get(
                    "deterministic_failure_reasons", []
                ),
                "number_contexts_preserved_posthoc": not context_conflicts,
                "number_context_conflicts": list(context_conflicts),
            }
            if judges:
                judge = judges[candidate_key]
                row.update(
                    llm_screen_pass=bool(judge["llm_screen_pass"]),
                    llm_material_error=bool(judge["material_error"]),
                    llm_reason_codes=judge["reason_codes"],
                )
            joined.append(row)
        return joined

    def _selection_stage(self, key: dict[str, Any], index: int) -> tuple[str, str]:
        explicit = key.get("selection_stage")
        if explicit:
            return str(explicit), "audit_key"
        return (
            (
                "balanced_core"
                if index < self.balanced_core_size
                else "disagreement_extension"
            ),
            "inferred_from_review_order_v1",
        )

    def _summary(
        self,
        rows: list[dict[str, Any]],
        reviewed_path: Path,
        template_path: Path,
        key_path: Path,
        selections_path: Path,
        judge_path: Path | None,
        secondary: dict[str, Any],
        secondary_agreement: dict[str, Any] | None,
        adjudication: dict[str, Any] | None,
        number_context_population: dict[str, Any],
    ) -> dict[str, Any]:
        core = [row for row in rows if row["selection_stage"] == "balanced_core"]
        extension = [row for row in rows if row not in core]
        if not core:
            raise ValueError("Human audit has no balanced-core rows")
        status = "complete_single_reviewer_exploratory"
        reviewer_count = 1
        adjudicator_count = 0
        if secondary_agreement is not None:
            reviewer_count = 2
            status = (
                "complete_two_reviewer"
                if secondary_agreement["adjudication_rows"] == 0
                else "complete_two_reviewer_pending_adjudication"
            )
        if adjudication is not None:
            adjudicator_count = 1
            status = "complete_two_reviewer_adjudicated"

        if adjudication is not None:
            review_boundary = (
                "Independent second review and adjudication are complete for the "
                "12-row enriched diagnostic subset; this subset is not a population "
                "estimate."
            )
        elif secondary_agreement is not None:
            review_boundary = (
                "Independent second review is complete for the 12-row enriched "
                f"diagnostic subset; {secondary_agreement['adjudication_rows']} "
                "rating disagreements still require adjudication."
            )
        else:
            review_boundary = (
                "There is one primary reviewer, so the result is exploratory until "
                "independent review and adjudication are complete."
            )
        summary = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "human_evaluation_status": status,
            "reviewer_count": reviewer_count,
            "adjudicator_count": adjudicator_count,
            "reviewed_rows": len(rows),
            "integrity": {
                "immutable_fields_match_template": True,
                "unique_review_ids": len({row["review_id"] for row in rows}),
                "reviewed_audit_sha256": _sha256(reviewed_path),
                "audit_template_sha256": _sha256(template_path),
                "audit_key_sha256": _sha256(key_path),
                "selections_sha256": _sha256(selections_path),
                "judge_evaluations_sha256": _sha256(judge_path) if judge_path else None,
            },
            "human_quality_pass_definition": {
                "minimum_meaning": self.minimum_meaning,
                "minimum_fluency": self.minimum_fluency,
                "requires_no_factual_or_polarity_error": True,
                "evidence_status": "exploratory_not_preregistered",
            },
            "balanced_core": {
                "role": "primary balanced human-quality signal; deterministic stable sample by algorithm/language/pipeline",
                "overall": _aggregate(core),
                "by_pipeline": _grouped(core, "pipeline"),
                "by_language": _grouped(core, "language"),
            },
            "disagreement_extension": {
                "role": "diagnostic enrichment; not a population-rate estimate",
                "overall": _aggregate(extension) if extension else None,
                "by_pipeline": _grouped(extension, "pipeline") if extension else {},
            },
            "all_reviewed_descriptive_only": _aggregate(rows),
            "threshold_sensitivity": {
                "meaning_gte_4_fluency_gte_4_no_error": _threshold_count(
                    rows, lambda row: row["human_quality_pass"]
                ),
                "meaning_5_fluency_gte_4_no_error": _threshold_count(
                    rows,
                    lambda row: (
                        row["human_meaning"] == 5
                        and row["human_fluency"] >= 4
                        and not row["human_material_error"]
                    ),
                ),
                "meaning_5_fluency_5_no_error": _threshold_count(
                    rows,
                    lambda row: (
                        row["human_meaning"] == 5
                        and row["human_fluency"] == 5
                        and not row["human_material_error"]
                    ),
                ),
            },
            "automatic_alignment": self._automatic_alignment(rows, core),
            "posthoc_number_context_check": {
                "role": "diagnostic added after human audit; not part of original candidate selection",
                "audited_conflict_count": sum(
                    not row["number_contexts_preserved_posthoc"] for row in rows
                ),
                "audited_conflicts": [
                    {
                        "review_id": row["review_id"],
                        "candidate_key": row["candidate_key"],
                        "pipeline": row["pipeline"],
                        "budget": row["budget"],
                        "details": row["number_context_conflicts"],
                    }
                    for row in rows
                    if not row["number_contexts_preserved_posthoc"]
                ],
                "progressive_population": number_context_population,
            },
            "human_problem_rows": [
                {
                    "review_id": row["review_id"],
                    "candidate_key": row["candidate_key"],
                    "pipeline": row["pipeline"],
                    "budget": row["budget"],
                    "meaning": row["human_meaning"],
                    "fluency": row["human_fluency"],
                    "material_error": row["human_material_error"],
                    "notes": row["human_notes"],
                }
                for row in rows
                if not row["human_quality_pass"]
            ],
            "secondary_review": {
                **secondary,
                "status": (
                    secondary_agreement["status"]
                    if secondary_agreement is not None
                    else secondary["status"]
                ),
            },
            "secondary_agreement": secondary_agreement,
            "adjudication": adjudication,
            "boundaries": [
                "The operational human-pass threshold was not preregistered and is reported with continuous scores and sensitivity counts.",
                "Only the balanced core is suitable for primary pipeline comparisons; the extension is enriched for automatic-system disagreements.",
                review_boundary,
                "The number-context check is post hoc and must be rerun prospectively before it can affect headline benchmark metrics.",
                "Six balanced rows per pipeline cannot establish an algorithm winner.",
            ],
        }
        return summary

    @staticmethod
    def _number_context_population_reanalysis(
        selections: list[dict[str, Any]],
    ) -> dict[str, Any]:
        conflicts = []
        for row in selections:
            details = number_context_conflicts(
                row["original_text"], row["candidate_text"], row["language"]
            )
            if details:
                conflicts.append(
                    {
                        "candidate_key": row["candidate_key"],
                        "sample_id": row["sample_id"],
                        "language": row["language"],
                        "pipeline": row["pipeline"],
                        "budget": row["budget"],
                        "details": list(details),
                    }
                )
        return {
            "rows": len(selections),
            "conflict_count": len(conflicts),
            "conflicts_by_pipeline": dict(
                Counter(row["pipeline"] for row in conflicts)
            ),
            "conflicts": conflicts,
        }

    @staticmethod
    def _automatic_alignment(
        rows: list[dict[str, Any]], core: list[dict[str, Any]]
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "combined_quality_gate_vs_human_balanced_core": _confusion(
                core, "combined_quality_gate_pass", "human_quality_pass"
            ),
            "combined_quality_gate_vs_human_all_audited": _confusion(
                rows, "combined_quality_gate_pass", "human_quality_pass"
            ),
            "deterministic_vs_human_balanced_core": _confusion(
                core, "deterministic_quality_pass", "human_quality_pass"
            ),
            "deterministic_vs_human_all_audited": _confusion(
                rows, "deterministic_quality_pass", "human_quality_pass"
            ),
        }
        if all("llm_screen_pass" in row for row in rows):
            payload.update(
                llm_judge_vs_human_balanced_core=_confusion(
                    core, "llm_screen_pass", "human_quality_pass"
                ),
                llm_judge_vs_human_all_audited=_confusion(
                    rows, "llm_screen_pass", "human_quality_pass"
                ),
                llm_material_error_vs_human_all_audited=_confusion(
                    rows, "llm_material_error", "human_material_error"
                ),
            )
            disagreements = [
                row
                for row in rows
                if row["combined_quality_gate_pass"] != row["llm_screen_pass"]
            ]
            payload["automatic_disagreement_adjudication"] = {
                "rows": len(disagreements),
                "human_sides_with_llm_judge": sum(
                    row["human_quality_pass"] == row["llm_screen_pass"]
                    for row in disagreements
                ),
                "human_sides_with_combined_quality_gate": sum(
                    row["human_quality_pass"] == row["combined_quality_gate_pass"]
                    for row in disagreements
                ),
            }
        return payload

    def _write_secondary_review(
        self,
        rows: list[dict[str, Any]],
        fields: list[str],
        output_dir: Path,
        source_column: str,
    ) -> dict[str, Any]:
        problems = [row for row in rows if not row["human_quality_pass"]]
        problem_keys = {row["candidate_key"] for row in problems}
        random_pool = [
            row
            for row in rows
            if row["selection_stage"] == "balanced_core"
            and row["candidate_key"] not in problem_keys
        ]
        random_rows = sorted(
            random_pool,
            key=lambda row: _stable_digest(
                f"{self.secondary_seed}|random|{row['candidate_key']}"
            ),
        )[: self.secondary_random_size]
        reasons = {row["candidate_key"]: "primary_quality_failure" for row in problems}
        reasons.update(
            {
                row["candidate_key"]: "balanced_core_random_reliability"
                for row in random_rows
            }
        )
        selected = sorted(
            [*problems, *random_rows],
            key=lambda row: _stable_digest(
                f"{self.secondary_seed}|blind-order|{row['candidate_key']}"
            ),
        )
        review_rows = []
        key_rows = []
        by_review_id = {row["review_id"]: row for row in rows}
        for index, row in enumerate(selected, start=1):
            secondary_id = f"secondary-{index:05d}"
            primary = by_review_id[row["review_id"]]
            review_rows.append(
                {
                    "review_id": secondary_id,
                    "language": primary["language"],
                    source_column: primary["source_text"],
                    "candidate_text": primary["candidate_text"],
                    RATING_FIELDS[0]: "",
                    RATING_FIELDS[1]: "",
                    FLAG_FIELD: "",
                    "notes": "",
                }
            )
            key_rows.append(
                {
                    "review_id": secondary_id,
                    "primary_review_id": row["review_id"],
                    "candidate_key": row["candidate_key"],
                    "selection_reason": reasons[row["candidate_key"]],
                }
            )

        _write_csv(output_dir / "second-review.csv", fields, review_rows)
        _write_json(output_dir / "second-review-key.json", {"rows": key_rows})
        return {
            "status": "pending",
            "artifact": "second-review.csv",
            "key_artifact": "second-review-key.json",
            "rows": len(review_rows),
            "primary_quality_failures": len(problems),
            "balanced_core_random_rows": len(random_rows),
            "seed": self.secondary_seed,
        }

    def _secondary_pairs(
        self,
        reviewed_path: Path,
        template_path: Path,
        key_path: Path,
        primary_rows: list[dict[str, Any]],
        source_column: str,
    ) -> list[dict[str, Any]]:
        secondary, fields = _read_csv(reviewed_path)
        template, template_fields = _read_csv(template_path)
        self._validate_primary(secondary, fields, template, template_fields)
        key_rows = _read_key(key_path)
        key_by_id = _unique_by(key_rows, "review_id", "secondary audit key")
        primary_by_id = {row["review_id"]: row for row in primary_rows}
        pairs = []
        for row in secondary:
            key = key_by_id[row["review_id"]]
            primary = primary_by_id[str(key["primary_review_id"])]
            meaning = int(row[RATING_FIELDS[0]])
            fluency = int(row[RATING_FIELDS[1]])
            material_error = row[FLAG_FIELD].lower() == "true"
            quality_pass = (
                meaning >= self.minimum_meaning
                and fluency >= self.minimum_fluency
                and not material_error
            )
            pairs.append(
                {
                    "secondary_review_id": row["review_id"],
                    "primary": primary,
                    "secondary_meaning": meaning,
                    "secondary_fluency": fluency,
                    "secondary_material_error": material_error,
                    "secondary_quality_pass": quality_pass,
                    "source_text": row[source_column],
                    "candidate_text": row["candidate_text"],
                    "selection_reason": str(key.get("selection_reason", "")),
                }
            )
        return pairs

    def _secondary_agreement(
        self,
        reviewed_path: Path,
        template_path: Path,
        key_path: Path,
        primary_rows: list[dict[str, Any]],
        output_dir: Path,
        source_column: str,
    ) -> dict[str, Any]:
        pairs = self._secondary_pairs(
            reviewed_path,
            template_path,
            key_path,
            primary_rows,
            source_column,
        )
        disagreements = [
            pair
            for pair in pairs
            if pair["primary"]["human_meaning"] != pair["secondary_meaning"]
            or pair["primary"]["human_fluency"] != pair["secondary_fluency"]
            or pair["primary"]["human_material_error"]
            != pair["secondary_material_error"]
        ]
        adjudication_fields = [
            "adjudication_id",
            "primary_review_id",
            "language",
            source_column,
            "candidate_text",
            "reviewer_1_meaning",
            "reviewer_2_meaning",
            "adjudicated_meaning_1_to_5",
            "reviewer_1_fluency",
            "reviewer_2_fluency",
            "adjudicated_fluency_1_to_5",
            "reviewer_1_factual_or_polarity_error",
            "reviewer_2_factual_or_polarity_error",
            "adjudicated_factual_or_polarity_error",
            "adjudication_notes",
        ]
        adjudication_rows = []
        for index, pair in enumerate(disagreements, start=1):
            primary = pair["primary"]
            adjudication_rows.append(
                {
                    "adjudication_id": f"adjudication-{index:05d}",
                    "primary_review_id": primary["review_id"],
                    "language": primary["language"],
                    source_column: pair["source_text"],
                    "candidate_text": pair["candidate_text"],
                    "reviewer_1_meaning": primary["human_meaning"],
                    "reviewer_2_meaning": pair["secondary_meaning"],
                    "adjudicated_meaning_1_to_5": "",
                    "reviewer_1_fluency": primary["human_fluency"],
                    "reviewer_2_fluency": pair["secondary_fluency"],
                    "adjudicated_fluency_1_to_5": "",
                    "reviewer_1_factual_or_polarity_error": str(
                        primary["human_material_error"]
                    ).lower(),
                    "reviewer_2_factual_or_polarity_error": str(
                        pair["secondary_material_error"]
                    ).lower(),
                    "adjudicated_factual_or_polarity_error": "",
                    "adjudication_notes": "",
                }
            )
        _write_csv(
            output_dir / "adjudication.csv",
            adjudication_fields,
            adjudication_rows,
        )
        primary_meaning = [pair["primary"]["human_meaning"] for pair in pairs]
        secondary_meaning = [pair["secondary_meaning"] for pair in pairs]
        primary_fluency = [pair["primary"]["human_fluency"] for pair in pairs]
        secondary_fluency = [pair["secondary_fluency"] for pair in pairs]
        return {
            "status": "complete",
            "rows": len(pairs),
            "meaning_exact_agreement": _agreement(primary_meaning, secondary_meaning),
            "meaning_within_one_agreement": _within_one_agreement(
                primary_meaning, secondary_meaning
            ),
            "meaning_quadratic_weighted_kappa": _weighted_kappa(
                primary_meaning, secondary_meaning
            ),
            "fluency_exact_agreement": _agreement(primary_fluency, secondary_fluency),
            "fluency_within_one_agreement": _within_one_agreement(
                primary_fluency, secondary_fluency
            ),
            "fluency_quadratic_weighted_kappa": _weighted_kappa(
                primary_fluency, secondary_fluency
            ),
            "material_error_kappa": _cohen_kappa(
                [pair["primary"]["human_material_error"] for pair in pairs],
                [pair["secondary_material_error"] for pair in pairs],
            ),
            "quality_pass_kappa": _cohen_kappa(
                [pair["primary"]["human_quality_pass"] for pair in pairs],
                [pair["secondary_quality_pass"] for pair in pairs],
            ),
            "adjudication_rows": len(disagreements),
            "adjudication_artifact": "adjudication.csv",
            "reviewed_audit_sha256": _sha256(reviewed_path),
        }

    def _adjudication(
        self,
        reviewed_path: Path,
        template_path: Path,
        secondary_reviewed_path: Path,
        secondary_template_path: Path,
        secondary_key_path: Path,
        primary_rows: list[dict[str, Any]],
        output_dir: Path,
        source_column: str,
    ) -> dict[str, Any]:
        reviewed, fields = _read_csv(reviewed_path)
        template, template_fields = _read_csv(template_path)
        self._validate_adjudication(reviewed, fields, template, template_fields)

        pairs = self._secondary_pairs(
            secondary_reviewed_path,
            secondary_template_path,
            secondary_key_path,
            primary_rows,
            source_column,
        )
        decisions_by_primary = {row["primary_review_id"]: row for row in reviewed}
        disagreements = [
            pair
            for pair in pairs
            if pair["primary"]["human_meaning"] != pair["secondary_meaning"]
            or pair["primary"]["human_fluency"] != pair["secondary_fluency"]
            or pair["primary"]["human_material_error"]
            != pair["secondary_material_error"]
        ]
        if set(decisions_by_primary) != {
            pair["primary"]["review_id"] for pair in disagreements
        }:
            raise ValueError(
                "Adjudication primary review IDs do not exactly match disagreements"
            )

        consensus_rows = []
        for pair in pairs:
            primary = pair["primary"]
            decision = decisions_by_primary.get(primary["review_id"])
            if decision is None:
                meaning = primary["human_meaning"]
                fluency = primary["human_fluency"]
                material_error = primary["human_material_error"]
                decision_source = "reviewer_agreement"
                notes = ""
            else:
                meaning = int(decision[ADJUDICATION_RATING_FIELDS[0]])
                fluency = int(decision[ADJUDICATION_RATING_FIELDS[1]])
                material_error = (
                    decision[ADJUDICATION_FLAG_FIELD].strip().lower() == "true"
                )
                decision_source = "adjudicator"
                notes = decision[ADJUDICATION_NOTES_FIELD]
            quality_pass = (
                meaning >= self.minimum_meaning
                and fluency >= self.minimum_fluency
                and not material_error
            )
            consensus_rows.append(
                {
                    "primary_review_id": primary["review_id"],
                    "secondary_review_id": pair["secondary_review_id"],
                    "language": primary["language"],
                    "candidate_key": primary["candidate_key"],
                    "pipeline": primary["pipeline"],
                    "budget": primary["budget"],
                    "selection_stage": primary["selection_stage"],
                    "selection_reason": pair["selection_reason"],
                    "source_text": pair["source_text"],
                    "candidate_text": pair["candidate_text"],
                    "reviewer_1_meaning": primary["human_meaning"],
                    "reviewer_2_meaning": pair["secondary_meaning"],
                    "consensus_meaning": meaning,
                    "reviewer_1_fluency": primary["human_fluency"],
                    "reviewer_2_fluency": pair["secondary_fluency"],
                    "consensus_fluency": fluency,
                    "reviewer_1_material_error": primary["human_material_error"],
                    "reviewer_2_material_error": pair["secondary_material_error"],
                    "consensus_material_error": material_error,
                    "reviewer_1_quality_pass": primary["human_quality_pass"],
                    "reviewer_2_quality_pass": pair["secondary_quality_pass"],
                    "consensus_quality_pass": quality_pass,
                    "decision_source": decision_source,
                    "adjudication_notes": notes,
                }
            )

        snapshot_path = output_dir / "adjudication.reviewed.csv"
        if reviewed_path.resolve() != snapshot_path.resolve():
            shutil.copyfile(reviewed_path, snapshot_path)
        _write_jsonl(output_dir / "adjudication.joined.jsonl", consensus_rows)

        adjudicated_rows = [
            row for row in consensus_rows if row["decision_source"] == "adjudicator"
        ]
        consensus_by_primary = {row["primary_review_id"]: row for row in consensus_rows}
        adjusted_rows = []
        quality_pass_changes = []
        for primary in primary_rows:
            consensus = consensus_by_primary.get(primary["review_id"])
            if consensus is None:
                adjusted_rows.append(primary)
                continue
            adjusted = {
                **primary,
                "human_meaning": consensus["consensus_meaning"],
                "human_fluency": consensus["consensus_fluency"],
                "human_material_error": consensus["consensus_material_error"],
                "human_quality_pass": consensus["consensus_quality_pass"],
                "human_notes": consensus["adjudication_notes"],
            }
            adjusted["human_quality_preserving_evasion"] = bool(
                adjusted["human_quality_pass"]
                and adjusted["preattack_detected"]
                and not adjusted["target_detected"]
            )
            adjusted_rows.append(adjusted)
            if primary["human_quality_pass"] != adjusted["human_quality_pass"]:
                quality_pass_changes.append(
                    {
                        "review_id": primary["review_id"],
                        "selection_stage": primary["selection_stage"],
                        "pipeline": primary["pipeline"],
                        "primary_quality_pass": primary["human_quality_pass"],
                        "consensus_quality_pass": adjusted["human_quality_pass"],
                    }
                )
        adjusted_core = [
            row for row in adjusted_rows if row["selection_stage"] == "balanced_core"
        ]
        return {
            "status": "complete",
            "rows": len(adjudicated_rows),
            "consensus_rows": len(consensus_rows),
            "consensus_mean_meaning": mean(
                row["consensus_meaning"] for row in consensus_rows
            ),
            "consensus_mean_fluency": mean(
                row["consensus_fluency"] for row in consensus_rows
            ),
            "consensus_material_error_count": sum(
                row["consensus_material_error"] for row in consensus_rows
            ),
            "consensus_quality_pass_count": sum(
                row["consensus_quality_pass"] for row in consensus_rows
            ),
            "consensus_quality_pass_rate": _ratio(
                sum(row["consensus_quality_pass"] for row in consensus_rows),
                len(consensus_rows),
            ),
            "consensus_quality_pass_matches_reviewer_1": _agreement(
                [int(row["consensus_quality_pass"]) for row in consensus_rows],
                [int(row["reviewer_1_quality_pass"]) for row in consensus_rows],
            ),
            "consensus_quality_pass_matches_reviewer_2": _agreement(
                [int(row["consensus_quality_pass"]) for row in consensus_rows],
                [int(row["reviewer_2_quality_pass"]) for row in consensus_rows],
            ),
            "quality_pass_changes_vs_primary": quality_pass_changes,
            "adjudication_adjusted_sensitivity": {
                "role": (
                    "post-hoc sensitivity only; overlays consensus on independently "
                    "reviewed rows and retains primary ratings elsewhere"
                ),
                "consensus_overlay_rows": len(consensus_rows),
                "primary_only_rows": len(primary_rows) - len(consensus_by_primary),
                "balanced_core": {
                    "overall": _aggregate(adjusted_core),
                    "by_pipeline": _grouped(adjusted_core, "pipeline"),
                },
                "all_reviewed_descriptive_only": _aggregate(adjusted_rows),
            },
            "reviewed_audit_sha256": _sha256(reviewed_path),
            "artifact": "adjudication.reviewed.csv",
            "joined_artifact": "adjudication.joined.jsonl",
        }

    @staticmethod
    def _validate_adjudication(
        reviewed: list[dict[str, str]],
        reviewed_fields: list[str],
        template: list[dict[str, str]],
        template_fields: list[str],
    ) -> None:
        required = {
            "adjudication_id",
            "primary_review_id",
            "language",
            "candidate_text",
            *ADJUDICATION_RATING_FIELDS,
            ADJUDICATION_FLAG_FIELD,
            ADJUDICATION_NOTES_FIELD,
        }
        missing = sorted(required.difference(reviewed_fields))
        if missing:
            raise ValueError(f"Adjudication is missing columns: {missing}")
        if reviewed_fields != template_fields:
            raise ValueError("Adjudication column order differs from its template")
        if len(reviewed) != len(template):
            raise ValueError("Adjudication row count differs from its template")
        if not reviewed:
            raise ValueError("Adjudication is empty")

        source_column = _source_column(reviewed_fields)
        mutable = {
            *ADJUDICATION_RATING_FIELDS,
            ADJUDICATION_FLAG_FIELD,
            ADJUDICATION_NOTES_FIELD,
        }
        immutable = [field for field in reviewed_fields if field not in mutable]
        identifiers = set()
        for index, (row, expected) in enumerate(
            zip(reviewed, template, strict=True), start=2
        ):
            adjudication_id = row["adjudication_id"]
            if adjudication_id in identifiers:
                raise ValueError(
                    f"Duplicate adjudication_id at CSV row {index}: {adjudication_id}"
                )
            identifiers.add(adjudication_id)
            if any(row[field] != expected[field] for field in immutable):
                raise ValueError(
                    "Adjudication input fields changed at CSV row "
                    f"{index}: {adjudication_id}"
                )
            if not row[source_column].strip() or not row["candidate_text"].strip():
                raise ValueError(
                    f"Adjudication text is empty at CSV row {index}: {adjudication_id}"
                )
            for field in ADJUDICATION_RATING_FIELDS:
                if row[field].strip() not in VALID_RATINGS:
                    raise ValueError(
                        f"Invalid or missing {field} at CSV row {index}: "
                        f"{adjudication_id}"
                    )
            if row[ADJUDICATION_FLAG_FIELD].strip().lower() not in VALID_FLAGS:
                raise ValueError(
                    f"Invalid or missing {ADJUDICATION_FLAG_FIELD} at CSV row "
                    f"{index}: {adjudication_id}"
                )

    @staticmethod
    def _update_report_summary(
        path: Path,
        output_dir: Path,
        human_summary: dict[str, Any],
    ) -> None:
        report = json.loads(path.read_text(encoding="utf-8"))
        relative_summary = os.path.relpath(
            output_dir / "human-audit.summary.json", path.parent
        )
        relative_audit = os.path.relpath(
            output_dir / "manual-audit.reviewed.csv", path.parent
        )
        report["human_evaluation_status"] = human_summary["human_evaluation_status"]
        report["human_evaluation_artifact"] = relative_audit
        report["human_evaluation"] = {
            "summary_artifact": relative_summary,
            "reviewer_count": human_summary["reviewer_count"],
            "adjudicator_count": human_summary["adjudicator_count"],
            "reviewed_rows": human_summary["reviewed_rows"],
            "balanced_core": human_summary["balanced_core"]["overall"],
            "secondary_review_status": human_summary["secondary_review"]["status"],
            "secondary_agreement": human_summary["secondary_agreement"],
            "adjudication": human_summary["adjudication"],
        }
        known_human_boundaries = {
            (
                "Human evaluation is complete for one exploratory reviewer; "
                "independent second review and adjudication remain required before "
                "algorithm promotion."
            ),
            (
                "Independent second review is complete; adjudication of rating "
                "disagreements remains required before algorithm promotion."
            ),
            (
                "Independent second review and adjudication are complete for the "
                "diagnostic subset; the sample remains too small for algorithm "
                "promotion."
            ),
        }
        report["boundaries"] = [
            value
            for value in report.get("boundaries", [])
            if value not in known_human_boundaries
        ]
        if human_summary["adjudication"] is not None:
            boundary = (
                "Independent second review and adjudication are complete for the "
                "diagnostic subset; the sample remains too small for algorithm "
                "promotion."
            )
        elif human_summary["secondary_agreement"] is not None:
            boundary = (
                "Independent second review is complete; adjudication of rating "
                "disagreements remains required before algorithm promotion."
            )
        else:
            boundary = (
                "Human evaluation is complete for one exploratory reviewer; "
                "independent second review and adjudication remain required before "
                "algorithm promotion."
            )
        report.setdefault("boundaries", []).append(boundary)
        _write_json(path, report)
        markdown_path = path.parent / "REPORT.md"
        if markdown_path.exists():
            current = markdown_path.read_text(encoding="utf-8")
            old = (
                "Human evaluation is pending; no algorithm should be promoted before "
                "it is complete."
            )
            replacement = (
                f"Human evaluation status: `{human_summary['human_evaluation_status']}`. "
                "See `../human-audit/HUMAN_AUDIT.md`; no algorithm is promoted."
            )
            if old in current:
                current = current.replace(old, replacement)
            else:
                current = re.sub(
                    r"Human evaluation status: `[^`]+`\. See "
                    r"`\.\./human-audit/HUMAN_AUDIT\.md`; no algorithm is "
                    r"promoted\.",
                    replacement,
                    current,
                )
            markdown_path.write_text(current, encoding="utf-8")

    @staticmethod
    def _render_markdown(summary: dict[str, Any]) -> str:
        core = summary["balanced_core"]
        lines = [
            "# Gate 2b human audit",
            "",
            f"Status: `{summary['human_evaluation_status']}`.",
            "",
            "The primary comparison uses the 24-row balanced core. The remaining rows are a diagnostic disagreement-enriched extension.",
            "",
            "## Balanced core",
            "",
            "| Pipeline | Rows | Meaning | Fluency | Material errors | Human quality pass | Quality-preserving conditional evasion | Mean edits |",
            "|---|---:|---:|---:|---:|---:|---:|---:|",
        ]
        for pipeline, metrics in core["by_pipeline"].items():
            lines.append(
                "| {pipeline} | {rows} | {meaning:.2f} | {fluency:.2f} | {errors} | {quality:.1%} | {evasion:.1%} | {edits:.1%} |".format(
                    pipeline=pipeline,
                    rows=metrics["rows"],
                    meaning=metrics["mean_meaning"],
                    fluency=metrics["mean_fluency"],
                    errors=metrics["material_error_count"],
                    quality=metrics["human_quality_pass_rate"],
                    evasion=metrics[
                        "human_quality_preserving_conditional_evasion_rate"
                    ],
                    edits=metrics["mean_changed_token_ratio"],
                )
            )
        alignment = summary["automatic_alignment"]
        lines.extend(
            [
                "",
                "## Automatic quality alignment",
                "",
                f"- LLM judge vs human, balanced core: `{alignment.get('llm_judge_vs_human_balanced_core', {}).get('accuracy', 'n/a')}` accuracy.",
                f"- Combined deterministic/neural gate vs human, balanced core: `{alignment['combined_quality_gate_vs_human_balanced_core']['accuracy']}` accuracy.",
            ]
        )
        agreement = summary["secondary_agreement"]
        if agreement is not None:
            lines.extend(
                [
                    "",
                    "## Independent second review",
                    "",
                    f"- Rows: `{agreement['rows']}`.",
                    f"- Meaning: `{agreement['meaning_exact_agreement']:.1%}` exact, `{agreement['meaning_within_one_agreement']:.1%}` within one, QWK `{agreement['meaning_quadratic_weighted_kappa']:.3f}`.",
                    f"- Fluency: `{agreement['fluency_exact_agreement']:.1%}` exact, `{agreement['fluency_within_one_agreement']:.1%}` within one, QWK `{agreement['fluency_quadratic_weighted_kappa']:.3f}`.",
                    f"- Material-error Cohen kappa: `{agreement['material_error_kappa']:.3f}`.",
                    f"- Quality-pass Cohen kappa: `{agreement['quality_pass_kappa']:.3f}`.",
                    f"- Rating disagreements requiring adjudication: `{agreement['adjudication_rows']}`.",
                ]
            )
        adjudication = summary["adjudication"]
        if adjudication is not None:
            adjusted = adjudication["adjudication_adjusted_sensitivity"]
            adjusted_core = adjusted["balanced_core"]["overall"]
            lines.extend(
                [
                    "",
                    "## Adjudicated diagnostic consensus",
                    "",
                    f"- Adjudicated disagreements: `{adjudication['rows']}`.",
                    f"- Consensus sample: `{adjudication['consensus_rows']}` rows.",
                    f"- Consensus quality pass: `{adjudication['consensus_quality_pass_count']}/{adjudication['consensus_rows']}` (`{adjudication['consensus_quality_pass_rate']:.1%}`).",
                    f"- Consensus material errors: `{adjudication['consensus_material_error_count']}`.",
                    f"- Quality-pass decisions changed vs primary: `{len(adjudication['quality_pass_changes_vs_primary'])}`.",
                    "",
                    "## Adjudication-adjusted sensitivity",
                    "",
                    f"This post-hoc view overlays consensus on {adjusted['consensus_overlay_rows']} independently reviewed rows and retains the primary ratings for the other {adjusted['primary_only_rows']}; it does not replace the primary analysis.",
                    "",
                    f"- Balanced-core quality pass: `{adjusted_core['human_quality_pass_count']}/{adjusted_core['rows']}` (`{adjusted_core['human_quality_pass_rate']:.1%}`).",
                    f"- Balanced-core quality-preserving conditional evasion: `{adjusted_core['human_quality_preserving_evasion_count']}/{adjusted_core['preattack_detected_count']}` (`{adjusted_core['human_quality_preserving_conditional_evasion_rate']:.1%}`).",
                ]
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


def _source_column(fields: list[str]) -> str:
    if "source_text" in fields:
        return "source_text"
    if "original_text" in fields:
        return "original_text"
    raise ValueError("Audit CSV requires source_text or original_text")


def _read_csv(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fields = list(reader.fieldnames or [])
        return [dict(row) for row in reader], fields


def _read_key(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("rows")
    if not isinstance(rows, list):
        raise TypeError(f"Audit key has no rows list: {path}")
    return rows


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _unique_by(
    rows: Iterable[dict[str, Any]], key: str, label: str
) -> dict[str, dict[str, Any]]:
    output = {}
    for row in rows:
        value = str(row[key])
        if value in output:
            raise ValueError(f"Duplicate {key} in {label}: {value}")
        output[value] = row
    return output


def _aggregate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        raise ValueError("Cannot aggregate an empty human-audit group")
    initially_detected = [row for row in rows if row["preattack_detected"]]
    quality_passes = sum(row["human_quality_pass"] for row in rows)
    useful = sum(row["human_quality_preserving_evasion"] for row in rows)
    return {
        "rows": len(rows),
        "mean_meaning": mean(row["human_meaning"] for row in rows),
        "median_meaning": _median(row["human_meaning"] for row in rows),
        "mean_fluency": mean(row["human_fluency"] for row in rows),
        "median_fluency": _median(row["human_fluency"] for row in rows),
        "material_error_count": sum(row["human_material_error"] for row in rows),
        "material_error_rate": _ratio(
            sum(row["human_material_error"] for row in rows), len(rows)
        ),
        "human_quality_pass_count": quality_passes,
        "human_quality_pass_rate": _ratio(quality_passes, len(rows)),
        "human_quality_pass_wilson_95": _wilson(quality_passes, len(rows)),
        "preattack_detected_count": len(initially_detected),
        "conditional_evasion_count": sum(
            not row["target_detected"] for row in initially_detected
        ),
        "conditional_evasion_rate": _ratio(
            sum(not row["target_detected"] for row in initially_detected),
            len(initially_detected),
        ),
        "human_quality_preserving_evasion_count": useful,
        "human_quality_preserving_conditional_evasion_rate": _ratio(
            useful, len(initially_detected)
        ),
        "mean_changed_token_ratio": mean(row["changed_token_ratio"] for row in rows),
        "budget_counts": dict(Counter(row["budget"] for row in rows)),
    }


def _grouped(rows: list[dict[str, Any]], field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row[field])].append(row)
    return {key: _aggregate(groups[key]) for key in sorted(groups)}


def _threshold_count(
    rows: list[dict[str, Any]], predicate: Callable[[dict[str, Any]], bool]
) -> dict[str, int]:
    core = [row for row in rows if row["selection_stage"] == "balanced_core"]
    return {
        "all_reviewed": sum(predicate(row) for row in rows),
        "balanced_core": sum(predicate(row) for row in core),
    }


def _confusion(
    rows: list[dict[str, Any]], prediction: str, truth: str
) -> dict[str, Any]:
    true_positive = sum(bool(row[prediction]) and bool(row[truth]) for row in rows)
    false_positive = sum(bool(row[prediction]) and not bool(row[truth]) for row in rows)
    false_negative = sum(not bool(row[prediction]) and bool(row[truth]) for row in rows)
    true_negative = sum(
        not bool(row[prediction]) and not bool(row[truth]) for row in rows
    )
    return {
        "rows": len(rows),
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
        "true_negative": true_negative,
        "accuracy": _ratio(true_positive + true_negative, len(rows)),
        "precision": _ratio(true_positive, true_positive + false_positive),
        "recall": _ratio(true_positive, true_positive + false_negative),
        "specificity": _ratio(true_negative, true_negative + false_positive),
    }


def _median(values: Iterable[int]) -> float:
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[midpoint])
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _wilson(successes: int, total: int) -> list[float] | None:
    if not total:
        return None
    z = 1.95996398454
    probability = successes / total
    denominator = 1 + z * z / total
    center = (probability + z * z / (2 * total)) / denominator
    margin = (
        z
        * math.sqrt(
            probability * (1 - probability) / total + z * z / (4 * total * total)
        )
        / denominator
    )
    return [center - margin, center + margin]


def _agreement(left: list[int], right: list[int]) -> float | None:
    return _ratio(sum(a == b for a, b in zip(left, right, strict=True)), len(left))


def _within_one_agreement(left: list[int], right: list[int]) -> float | None:
    return _ratio(
        sum(abs(a - b) <= 1 for a, b in zip(left, right, strict=True)), len(left)
    )


def _weighted_kappa(left: list[int], right: list[int]) -> float | None:
    if not left:
        return None
    categories = range(1, 6)
    observed = Counter(zip(left, right, strict=True))
    left_counts = Counter(left)
    right_counts = Counter(right)
    total = len(left)
    observed_disagreement = sum(
        ((a - b) / 4) ** 2 * observed[(a, b)] / total
        for a in categories
        for b in categories
    )
    expected_disagreement = sum(
        ((a - b) / 4) ** 2 * (left_counts[a] / total) * (right_counts[b] / total)
        for a in categories
        for b in categories
    )
    if expected_disagreement == 0:
        return 1.0 if observed_disagreement == 0 else None
    return 1 - observed_disagreement / expected_disagreement


def _cohen_kappa(left: list[bool], right: list[bool]) -> float | None:
    if not left:
        return None
    agreement = sum(a == b for a, b in zip(left, right, strict=True)) / len(left)
    left_true = sum(left) / len(left)
    right_true = sum(right) / len(right)
    expected = left_true * right_true + (1 - left_true) * (1 - right_true)
    if expected == 1:
        return 1.0 if agreement == 1 else None
    return (agreement - expected) / (1 - expected)


def _stable_digest(value: str) -> bytes:
    return hashlib.blake2b(value.encode("utf-8"), digest_size=16).digest()


def _sha256(path: Path | None) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path else None


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(path)


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def _write_csv(path: Path, fields: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
