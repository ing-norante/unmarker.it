from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from unmarker_text_bench.human_audit import HumanAuditRunner
from unmarker_text_bench.llm_judge import LlmJudgeRunner
from unmarker_text_bench.number_context import number_context_conflicts
from unmarker_text_bench.quality_checks import deterministic_quality

FIELDS = [
    "review_id",
    "language",
    "source_text",
    "candidate_text",
    "meaning_preservation_1_to_5",
    "fluency_1_to_5",
    "factual_or_polarity_error",
    "notes",
]


class HumanAuditTests(unittest.TestCase):
    def test_manual_audit_key_records_balanced_and_extension_stages(self) -> None:
        rows = []
        for index in range(60):
            rows.append(
                {
                    "candidate_key": f"candidate-{index}",
                    "algorithm": "EXP",
                    "language": "en" if index % 2 else "it",
                    "pipeline": f"pipeline-{index % 4}",
                    "quality_pass": index % 3 == 0,
                    "llm_screen_pass": index % 2 == 0,
                    "original_text": f"Source {index}",
                    "candidate_text": f"Candidate {index}",
                }
            )

        selected = LlmJudgeRunner._manual_audit(rows, 32)

        self.assertEqual(len(selected), 32)
        self.assertTrue(
            all(
                row["manual_audit_selection_stage"] == "balanced_core"
                for row in selected[:24]
            )
        )
        self.assertTrue(
            all(
                row["manual_audit_selection_stage"]
                in {"disagreement_extension", "deterministic_fill_extension"}
                for row in selected[24:]
            )
        )

    def test_completed_audit_is_joined_summarized_and_snapshotted(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = self._fixtures(root)
            output = root / "human-audit"
            summary = HumanAuditRunner(
                balanced_core_size=4,
                secondary_random_size=2,
                secondary_seed=17,
            ).run(
                paths["reviewed"],
                paths["template"],
                paths["key"],
                paths["selections"],
                output,
                judge_evaluations_path=paths["judge"],
                report_summary_path=paths["report"],
            )

            self.assertEqual(
                summary["human_evaluation_status"],
                "complete_single_reviewer_exploratory",
            )
            self.assertEqual(summary["reviewed_rows"], 8)
            self.assertEqual(summary["balanced_core"]["overall"]["rows"], 4)
            self.assertEqual(
                summary["balanced_core"]["overall"]["human_quality_pass_count"],
                3,
            )
            self.assertEqual(summary["secondary_review"]["rows"], 3)
            self.assertEqual(summary["secondary_review"]["primary_quality_failures"], 1)
            self.assertTrue((output / "manual-audit.reviewed.csv").exists())
            self.assertTrue((output / "human-audit.joined.jsonl").exists())
            self.assertTrue((output / "HUMAN_AUDIT.md").exists())

            second_rows = self._read_csv(output / "second-review.csv")
            self.assertEqual(len(second_rows), 3)
            self.assertTrue(
                all(not row["meaning_preservation_1_to_5"] for row in second_rows)
            )
            report = json.loads(paths["report"].read_text())
            self.assertEqual(
                report["human_evaluation_status"],
                "complete_single_reviewer_exploratory",
            )

    def test_secondary_review_produces_agreement_and_adjudication(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = self._fixtures(root)
            output = root / "human-audit"
            runner = HumanAuditRunner(
                balanced_core_size=4,
                secondary_random_size=2,
                secondary_seed=17,
            )
            runner.run(
                paths["reviewed"],
                paths["template"],
                paths["key"],
                paths["selections"],
                output,
                judge_evaluations_path=paths["judge"],
            )
            primary = {
                row["review_id"]: row for row in self._read_csv(paths["reviewed"])
            }
            second_key = {
                row["review_id"]: row
                for row in json.loads((output / "second-review-key.json").read_text())[
                    "rows"
                ]
            }
            second = self._read_csv(output / "second-review.csv")
            for row in second:
                source = primary[second_key[row["review_id"]]["primary_review_id"]]
                row["meaning_preservation_1_to_5"] = source[
                    "meaning_preservation_1_to_5"
                ]
                row["fluency_1_to_5"] = source["fluency_1_to_5"]
                row["factual_or_polarity_error"] = source["factual_or_polarity_error"]
            second[0]["fluency_1_to_5"] = (
                "4" if second[0]["fluency_1_to_5"] == "5" else "5"
            )
            secondary_reviewed = root / "second-review.reviewed.csv"
            self._write_csv(secondary_reviewed, second)

            summary = runner.run(
                paths["reviewed"],
                paths["template"],
                paths["key"],
                paths["selections"],
                output,
                judge_evaluations_path=paths["judge"],
                secondary_reviewed_path=secondary_reviewed,
            )

            self.assertEqual(
                summary["human_evaluation_status"],
                "complete_two_reviewer_pending_adjudication",
            )
            self.assertEqual(summary["secondary_agreement"]["rows"], 3)
            self.assertEqual(summary["secondary_agreement"]["adjudication_rows"], 1)
            self.assertEqual(len(self._read_csv(output / "adjudication.csv")), 1)

            adjudication = self._read_csv(output / "adjudication.csv")
            for row in adjudication:
                row["adjudicated_meaning_1_to_5"] = row["reviewer_1_meaning"]
                row["adjudicated_fluency_1_to_5"] = row["reviewer_1_fluency"]
                row["adjudicated_factual_or_polarity_error"] = row[
                    "reviewer_1_factual_or_polarity_error"
                ]
                row["adjudication_notes"] = "Resolved by protocol."
            adjudicated_review = root / "adjudication.reviewed.csv"
            self._write_rows(adjudicated_review, adjudication)

            final = runner.run(
                paths["reviewed"],
                paths["template"],
                paths["key"],
                paths["selections"],
                output,
                judge_evaluations_path=paths["judge"],
                report_summary_path=paths["report"],
                secondary_reviewed_path=secondary_reviewed,
                adjudicated_audit_path=adjudicated_review,
            )

            self.assertEqual(
                final["human_evaluation_status"],
                "complete_two_reviewer_adjudicated",
            )
            self.assertEqual(final["adjudicator_count"], 1)
            self.assertEqual(final["adjudication"]["rows"], 1)
            self.assertEqual(final["adjudication"]["consensus_rows"], 3)
            self.assertTrue((output / "adjudication.reviewed.csv").exists())
            self.assertTrue((output / "adjudication.joined.jsonl").exists())
            report = json.loads(paths["report"].read_text())
            self.assertEqual(
                report["human_evaluation_status"],
                "complete_two_reviewer_adjudicated",
            )

    def test_adjudication_requires_secondary_review(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = self._fixtures(root)
            with self.assertRaisesRegex(
                ValueError, "--adjudicated-audit requires --secondary-reviewed"
            ):
                HumanAuditRunner(balanced_core_size=4).run(
                    paths["reviewed"],
                    paths["template"],
                    paths["key"],
                    paths["selections"],
                    root / "output",
                    adjudicated_audit_path=root / "adjudication.reviewed.csv",
                )

    def test_changed_blind_text_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = self._fixtures(root)
            rows = self._read_csv(paths["reviewed"])
            rows[0]["candidate_text"] = "Tampered candidate"
            self._write_csv(paths["reviewed"], rows)
            with self.assertRaisesRegex(ValueError, "Blind input fields changed"):
                HumanAuditRunner(balanced_core_size=4).run(
                    paths["reviewed"],
                    paths["template"],
                    paths["key"],
                    paths["selections"],
                    root / "output",
                )

    @staticmethod
    def _fixtures(root: Path) -> dict[str, Path]:
        template = root / "manual-audit.csv"
        reviewed = root / "manual-audit.reviewed.csv"
        key = root / "manual-audit-key.json"
        selections = root / "progressive-selections.jsonl"
        judge = root / "llm-judge.jsonl"
        report = root / "summary.json"
        template_rows = []
        reviewed_rows = []
        key_rows = []
        selection_rows = []
        judge_rows = []
        for index in range(1, 9):
            review_id = f"audit-{index:05d}"
            candidate_key = f"sample-{index}|EXP|pipeline-{index % 2}|aggressive"
            language = "en" if index % 2 else "it"
            source = f"Source {index} has value {2000 + index}."
            candidate = f"Candidate {index} keeps value {2000 + index}."
            template_rows.append(
                {
                    "review_id": review_id,
                    "language": language,
                    "source_text": source,
                    "candidate_text": candidate,
                    "meaning_preservation_1_to_5": "",
                    "fluency_1_to_5": "",
                    "factual_or_polarity_error": "",
                    "notes": "",
                }
            )
            reviewed_rows.append(
                {
                    **template_rows[-1],
                    "meaning_preservation_1_to_5": "3" if index == 1 else "5",
                    "fluency_1_to_5": "3" if index == 1 else "5",
                    "factual_or_polarity_error": "false",
                }
            )
            key_rows.append(
                {
                    "review_id": review_id,
                    "candidate_key": candidate_key,
                    "selection_reason": "fixture",
                }
            )
            selection_rows.append(
                {
                    "candidate_key": candidate_key,
                    "language": language,
                    "original_text": source,
                    "candidate_text": candidate,
                    "algorithm": "EXP",
                    "pipeline": f"pipeline-{index % 2}",
                    "budget": "aggressive",
                    "sample_id": f"sample-{index}",
                    "preattack_detected": True,
                    "target_detected": index % 3 == 0,
                    "changed_token_ratio": 0.2,
                    "quality_pass": index != 1,
                    "deterministic_failure_reasons": (
                        ["entities"] if index == 1 else []
                    ),
                }
            )
            judge_rows.append(
                {
                    "candidate_key": candidate_key,
                    "llm_screen_pass": index != 1,
                    "material_error": False,
                    "reason_codes": ["none"],
                }
            )
        HumanAuditTests._write_csv(template, template_rows)
        HumanAuditTests._write_csv(reviewed, reviewed_rows)
        key.write_text(json.dumps({"rows": key_rows}), encoding="utf-8")
        HumanAuditTests._write_jsonl(selections, selection_rows)
        HumanAuditTests._write_jsonl(judge, judge_rows)
        report.write_text(
            json.dumps(
                {
                    "human_evaluation_status": "pending",
                    "human_evaluation_artifact": "human-review.csv",
                    "boundaries": [],
                }
            ),
            encoding="utf-8",
        )
        return {
            "template": template,
            "reviewed": reviewed,
            "key": key,
            "selections": selections,
            "judge": judge,
            "report": report,
        }

    @staticmethod
    def _write_csv(path: Path, rows: list[dict[str, str]]) -> None:
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)

    @staticmethod
    def _write_rows(path: Path, rows: list[dict[str, str]]) -> None:
        if not rows:
            raise ValueError("Cannot write an empty fixture")
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    @staticmethod
    def _write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
        path.write_text(
            "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
        )

    @staticmethod
    def _read_csv(path: Path) -> list[dict[str, str]]:
        with path.open(newline="", encoding="utf-8") as handle:
            return list(csv.DictReader(handle))


class NumberContextTests(unittest.TestCase):
    def test_swapped_years_are_bound_to_their_local_facts(self) -> None:
        original = (
            "Born in 1960, Kirk MacDonald grew up in British Columbia. "
            "His political career began in the late 1990s."
        )
        candidate = (
            "Born in 1990, Kirk MacDonald grew up in British Columbia. "
            "His political career began in the late 1960s."
        )

        conflicts = number_context_conflicts(original, candidate, "en")
        quality = deterministic_quality(original, candidate, "en")

        self.assertTrue(conflicts)
        self.assertFalse(quality.number_contexts_preserved)
        self.assertFalse(quality.passes)
        self.assertIn("number_contexts", quality.failure_reasons)

    def test_reordered_sentences_keep_correct_number_bindings(self) -> None:
        original = "Alice won in 2020. Bob won in 2021."
        candidate = "Bob won in 2021. Alice won in 2020."

        self.assertEqual(number_context_conflicts(original, candidate, "en"), ())
        self.assertTrue(
            deterministic_quality(original, candidate, "en").number_contexts_preserved
        )


if __name__ == "__main__":
    unittest.main()
