from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from typing import Any
from urllib.request import Request

from unmarker_text_bench.generic_detectors import (
    CopyleaksDetector,
    DetectionRunner,
    GenericCorpusBuilder,
    GenericDetectorReport,
    GptZeroDetector,
    JsonApiClient,
    read_jsonl,
    sha256_text,
    write_jsonl,
)

PIPELINES = ("simple_paraphrase", "sira", "bira", "bira_position_aware")


class GenericDetectorTests(unittest.TestCase):
    def test_corpus_builder_deduplicates_originals_and_preserves_four_rewrites(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            selections = root / "selections.jsonl"
            rows = self._selections()
            write_jsonl(selections, rows)

            manifest = GenericCorpusBuilder().run(selections, root / "corpus")
            documents = read_jsonl(root / "corpus" / "documents.jsonl")

            self.assertEqual(manifest["document_count"], 10)
            self.assertEqual(manifest["original_count"], 2)
            self.assertEqual(manifest["rewrite_count"], 8)
            self.assertEqual(len({row["document_id"] for row in documents}), 10)
            self.assertEqual(len({row["text_sha256"] for row in documents}), 10)
            self.assertTrue(manifest["copyleaks_minimum_character_contract_pass"])

    def test_corpus_builder_rejects_an_incomplete_pipeline_cell(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            selections = root / "selections.jsonl"
            write_jsonl(selections, self._selections()[:-1])
            with self.assertRaisesRegex(ValueError, "exactly the four"):
                GenericCorpusBuilder().run(selections, root / "corpus")

    def test_copyleaks_adapter_authenticates_and_normalizes_summary(self) -> None:
        requests: list[Request] = []

        def transport(request: Request, _: float) -> tuple[int, bytes]:
            requests.append(request)
            if "login" in request.full_url:
                return 200, b'{"access_token":"secret-token"}'
            return (
                200,
                (
                    b'{"modelVersion":"v9","summary":{"human":0.2,"ai":0.8},'
                    b'"scannedDocument":{"actualCredits":1}}'
                ),
            )

        detector = CopyleaksDetector(
            "owner@example.test",
            "api-key",
            api=JsonApiClient(transport=transport),
        )
        result = detector.detect(self._document("one"))

        self.assertTrue(result["native_ai_detected"])
        self.assertEqual(result["score"], 0.8)
        self.assertEqual(result["model_version"], "v9")
        self.assertEqual(len(requests), 2)
        scan_body = json.loads(requests[1].data or b"{}")
        self.assertEqual(scan_body["language"], "en")
        self.assertNotIn("api-key", json.dumps(result))

    def test_gptzero_adapter_supports_current_classification_contract(self) -> None:
        def transport(_: Request, __: float) -> tuple[int, bytes]:
            return (
                200,
                json.dumps(
                    {
                        "documents": [
                            {
                                "document_classification": "MIXED",
                                "class_probabilities": {
                                    "human": 0.15,
                                    "mixed": 0.7,
                                    "ai": 0.15,
                                },
                                "version": "2026-08",
                            }
                        ]
                    }
                ).encode(),
            )

        detector = GptZeroDetector("api-key", api=JsonApiClient(transport=transport))
        result = detector.detect(self._document("one"))

        self.assertTrue(result["native_ai_detected"])
        self.assertAlmostEqual(result["score"], 0.85)
        self.assertEqual(result["native_label"], "MIXED")

    def test_runner_resumes_only_successful_hash_matching_documents(self) -> None:
        class FakeDetector:
            detector_id = "fake"

            def __init__(self) -> None:
                self.calls = 0

            @property
            def metadata(self) -> dict[str, Any]:
                return {"version": "one"}

            def detect(self, _: dict[str, Any]) -> dict[str, Any]:
                self.calls += 1
                return {
                    "score": 0.9,
                    "score_name": "fake",
                    "native_ai_detected": True,
                    "native_label": "AI",
                    "model_version": "one",
                    "request_id": None,
                    "attempt_count": 1,
                    "latency_ms": 1.0,
                    "billable_units": None,
                    "raw_response": {"score": 0.9},
                }

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            documents_path = root / "documents.jsonl"
            write_jsonl(
                documents_path,
                [self._document("one"), self._document("two")],
            )
            detector = FakeDetector()
            runner = DetectionRunner(detector, max_workers=2)
            first = runner.run(documents_path, root / "output")
            second = runner.run(documents_path, root / "output")

            self.assertEqual(first["succeeded"], 2)
            self.assertEqual(second["resumed"], 2)
            self.assertEqual(detector.calls, 2)
            self.assertEqual(len(read_jsonl(root / "output" / "results.jsonl")), 2)

    def test_report_calculates_conditional_evasion_and_intersection(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            selections = root / "selections.jsonl"
            write_jsonl(selections, self._selections())
            GenericCorpusBuilder().run(selections, root / "corpus")
            documents = read_jsonl(root / "corpus" / "documents.jsonl")

            paths = []
            for detector in ("alpha", "beta"):
                path = root / detector / "results.jsonl"
                result_rows = []
                for document in documents:
                    detected = document["role"] == "ai_original" or (
                        document["pipeline"] != "bira_position_aware"
                    )
                    result_rows.append(
                        {
                            "detector_id": detector,
                            "document_id": document["document_id"],
                            "text_sha256": document["text_sha256"],
                            "status": "success",
                            "score": 0.9 if detected else 0.1,
                            "score_name": "test",
                            "native_ai_detected": detected,
                            "native_label": "AI" if detected else "HUMAN",
                            "model_version": "test",
                            "latency_ms": 1,
                        }
                    )
                write_jsonl(path, result_rows)
                paths.append(path)

            summary = GenericDetectorReport().run(
                root / "corpus" / "documents.jsonl",
                paths,
                root / "report",
                required_detectors=("alpha", "beta"),
            )

            evasion = summary["metrics"]["alpha"]["en"]["pipelines"][
                "bira_position_aware"
            ]["conditional_evasion"]
            self.assertEqual(evasion["rate"], 1.0)
            intersection = summary["all_detector_intersection"]["it"][
                "bira_position_aware"
            ]
            self.assertEqual(intersection["rate"], 1.0)
            self.assertTrue(summary["complete_matrix"])
            self.assertTrue((root / "report" / "REPORT.md").exists())

    @staticmethod
    def _selections() -> list[dict[str, Any]]:
        rows = []
        for language in ("en", "it"):
            sample_id = f"sample-{language}"
            original = (f"Original {language} text with stable facts. " * 15).strip()
            for index, pipeline in enumerate(PIPELINES):
                candidate = (
                    f"Rewritten {language} text for {pipeline} with stable facts {index}. "
                    * 12
                ).strip()
                rows.append(
                    {
                        "candidate_key": f"{sample_id}|EXP|{pipeline}|selected",
                        "sample_id": sample_id,
                        "language": language,
                        "pipeline": pipeline,
                        "algorithm": "EXP",
                        "domain": "test",
                        "original_text": original,
                        "candidate_text": candidate,
                        "quality_pass": True,
                        "changed_token_ratio": 0.2,
                        "preattack_detected": True,
                        "target_detected": False,
                    }
                )
        return rows

    @staticmethod
    def _document(identifier: str) -> dict[str, Any]:
        text = (
            f"Document {identifier} with enough content for API testing. " * 12
        ).strip()
        return {
            "document_id": identifier,
            "text": text,
            "text_sha256": sha256_text(text),
            "language": "en",
            "role": "rewrite",
            "sample_id": identifier,
            "pipeline": "simple_paraphrase",
        }


if __name__ == "__main__":
    unittest.main()
