from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from unmarker_text_bench.anthropic_mark_evaluation import (
    export_adaptive_pairs,
    report_official_results,
)


def _adaptive_row(
    request_id: str,
    language: str,
    *,
    family: str = "anthropic",
    quality_pass: bool = True,
) -> dict:
    source = f"Original {request_id} text."
    selected = f"Rewritten {request_id} text."
    return {
        "request_id": request_id,
        "status": "success",
        "cascade_status": "accepted",
        "selected_text": selected,
        "result": {
            "status": "accepted",
            "request": {
                "request_id": request_id,
                "language": language,
                "text": source,
                "generator_family": family,
                "target_algorithm": None,
                "terminology": [],
            },
            "baseline": {
                "candidate": {
                    "candidate_id": f"{request_id}|original",
                    "text": source,
                }
            },
            "selected": {
                "candidate": {
                    "candidate_id": f"{request_id}|selected-candidate",
                    "text": selected,
                },
                "quality_pass": quality_pass,
            },
        },
    }


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def _read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line]


class AnthropicMarkEvaluationTests(unittest.TestCase):
    def test_export_freezes_paired_hashes_and_private_preview_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            adaptive = root / "adaptive.jsonl"
            _write_jsonl(
                adaptive,
                [_adaptive_row("en-1", "en"), _adaptive_row("it-1", "it")],
            )

            manifest = export_adaptive_pairs(
                [adaptive],
                root / "export",
                source_provenance="supported_claude_marked",
                expected_generator_family="anthropic",
                source_model="claude-supported-test-model",
                source_surface="claude-platform-api",
            )

            self.assertEqual(manifest["request_count"], 2)
            self.assertEqual(manifest["item_count"], 4)
            self.assertFalse(manifest["public_content_checker_compatible"])
            self.assertEqual(
                manifest["access_contract"], "anthropic-private-preview-required"
            )
            batch = _read_jsonl(root / "export" / "batch.jsonl")
            self.assertEqual(
                {(row["request_id"], row["variant"]) for row in batch},
                {
                    ("en-1", "source"),
                    ("en-1", "selected"),
                    ("it-1", "source"),
                    ("it-1", "selected"),
                },
            )
            self.assertTrue(all(len(row["text_sha256"]) == 64 for row in batch))
            template = _read_jsonl(root / "export" / "detector-results.template.jsonl")
            self.assertTrue(all(row["status"] == "pending" for row in template))

    def test_export_rejects_wrong_generator_family(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            adaptive = root / "adaptive.jsonl"
            _write_jsonl(adaptive, [_adaptive_row("qwen-1", "en", family="qwen")])
            with self.assertRaisesRegex(ValueError, "expected 'anthropic'"):
                export_adaptive_pairs(
                    [adaptive],
                    root / "export",
                    source_provenance="supported_claude_marked",
                    expected_generator_family="anthropic",
                    source_model="claude-supported-test-model",
                    source_surface="claude-platform-api",
                )

    def test_report_computes_paired_quality_preserving_evasion(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            adaptive = root / "adaptive.jsonl"
            _write_jsonl(
                adaptive,
                [
                    _adaptive_row("en-1", "en"),
                    _adaptive_row("it-1", "it", quality_pass=False),
                ],
            )
            export_adaptive_pairs(
                [adaptive],
                root / "export",
                source_provenance="supported_claude_marked",
                expected_generator_family="anthropic",
                source_model="claude-supported-test-model",
                source_surface="claude-platform-api",
            )
            batch = _read_jsonl(root / "export" / "batch.jsonl")
            decisions = {
                ("en-1", "source"): True,
                ("en-1", "selected"): False,
                ("it-1", "source"): True,
                ("it-1", "selected"): True,
            }
            results = [
                {
                    "item_id": row["item_id"],
                    "text_sha256": row["text_sha256"],
                    "status": "success",
                    "mark_detected": decisions[(row["request_id"], row["variant"])],
                    "detector_version": "private-preview-test",
                }
                for row in batch
            ]
            result_path = root / "official-results.jsonl"
            _write_jsonl(result_path, results)

            report = report_official_results(
                root / "export" / "batch.jsonl",
                result_path,
                root / "report",
            )

            self.assertTrue(report["complete"])
            self.assertTrue(report["claim_admissible"])
            self.assertEqual(report["combined"]["paired_count"], 2)
            self.assertEqual(report["combined"]["source_detected_count"], 2)
            self.assertEqual(report["combined"]["conditional_evasion_count"], 1)
            self.assertEqual(
                report["combined"]["quality_preserving_conditional_evasion_count"],
                1,
            )
            self.assertEqual(report["combined"]["mark_introduction_count"], 0)
            self.assertTrue((root / "report" / "REPORT.md").exists())

    def test_report_rejects_incomplete_and_hash_mismatched_results(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            adaptive = root / "adaptive.jsonl"
            _write_jsonl(adaptive, [_adaptive_row("en-1", "en")])
            export_adaptive_pairs([adaptive], root / "export")
            batch = _read_jsonl(root / "export" / "batch.jsonl")

            incomplete = root / "incomplete.jsonl"
            _write_jsonl(
                incomplete,
                [
                    {
                        "item_id": batch[0]["item_id"],
                        "text_sha256": batch[0]["text_sha256"],
                        "status": "success",
                        "mark_detected": False,
                    }
                ],
            )
            with self.assertRaisesRegex(ValueError, "incomplete"):
                report_official_results(
                    root / "export" / "batch.jsonl", incomplete, root / "report"
                )

            mismatched = root / "mismatched.jsonl"
            _write_jsonl(
                mismatched,
                [
                    {
                        "item_id": row["item_id"],
                        "text_sha256": "0" * 64,
                        "status": "success",
                        "mark_detected": False,
                    }
                    for row in batch
                ],
            )
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                report_official_results(
                    root / "export" / "batch.jsonl", mismatched, root / "report"
                )

            tampered_batch = root / "tampered-batch.jsonl"
            tampered_rows = list(batch)
            tampered_rows[0] = {**tampered_rows[0], "text": "tampered"}
            _write_jsonl(tampered_batch, tampered_rows)
            with self.assertRaisesRegex(ValueError, "manifest hash"):
                report_official_results(
                    tampered_batch,
                    mismatched,
                    root / "report",
                    manifest_path=root / "export" / "manifest.json",
                )


if __name__ == "__main__":
    unittest.main()
