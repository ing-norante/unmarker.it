from __future__ import annotations

import json
import tempfile
import types
import unittest
from pathlib import Path
from typing import Any
from unittest import mock
from urllib.request import Request

from unmarker_text_bench.detector_calibration import DetectorCalibrator
from unmarker_text_bench.detector_controls import HumanControlCorpusBuilder
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

    def test_human_controls_are_split_and_exclude_benchmark_articles(self) -> None:
        class FakeStream:
            def __init__(self, rows: list[dict[str, Any]]) -> None:
                self.rows = rows

            def shuffle(self, **_: Any) -> FakeStream:
                return self

            def __iter__(self):
                return iter(self.rows)

        def load_dataset(_: str, config: str, **__: Any) -> FakeStream:
            language = "it" if config.endswith(".it") else "en"
            body = " ".join(f"word{index}" for index in range(240))
            return FakeStream(
                [
                    {
                        "id": identifier,
                        "title": f"Article {identifier}",
                        "text": body,
                        "url": f"https://example.test/{identifier}",
                    }
                    for identifier in (f"used-{language}", "fresh-1", "fresh-2")
                ]
            )

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            benchmark_path = root / "benchmark.jsonl"
            benchmark = []
            for language in ("en", "it"):
                row = self._document(f"benchmark-{language}")
                row.update(
                    {
                        "language": language,
                        "sample_id": f"wikipedia-{language}-used-{language}",
                        "word_count": 144,
                    }
                )
                benchmark.append(row)
            write_jsonl(benchmark_path, benchmark)
            fake_datasets = types.SimpleNamespace(load_dataset=load_dataset)
            with mock.patch.dict("sys.modules", {"datasets": fake_datasets}):
                manifest = HumanControlCorpusBuilder().run(
                    benchmark_path,
                    root / "controls" / "documents.jsonl",
                    calibration_per_language=1,
                    evaluation_per_language=1,
                )
            controls = read_jsonl(root / "controls" / "documents.jsonl")

            self.assertEqual(manifest["document_count"], 4)
            self.assertEqual(
                {(row["language"], row["control_split"]) for row in controls},
                {
                    ("en", "calibration"),
                    ("en", "evaluation"),
                    ("it", "calibration"),
                    ("it", "evaluation"),
                },
            )
            self.assertFalse(any("used-" in row["document_id"] for row in controls))
            self.assertTrue((root / "controls" / "controls-manifest.json").exists())

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
                            "score_direction": "higher_is_ai",
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

    def test_calibration_fits_strict_language_thresholds_and_report_uses_them(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            controls = []
            control_results = []
            for language in ("en", "it"):
                for split, count in (("calibration", 100), ("evaluation", 20)):
                    for index in range(count):
                        document = self._document(f"{language}-{split}-{index}")
                        document.update(
                            {
                                "language": language,
                                "role": "human_control",
                                "pipeline": "human_control",
                                "control_split": split,
                            }
                        )
                        controls.append(document)
                        control_results.append(
                            {
                                "detector_id": "alpha",
                                "document_id": document["document_id"],
                                "text_sha256": document["text_sha256"],
                                "language": language,
                                "status": "success",
                                "score": float(index),
                                "score_name": "test",
                                "score_direction": "higher_is_ai",
                                "native_ai_detected": False,
                                "model_version": "test-v1",
                            }
                        )
            controls_path = root / "controls.jsonl"
            control_results_path = root / "alpha-controls" / "results.jsonl"
            write_jsonl(controls_path, controls)
            write_jsonl(control_results_path, control_results)
            calibration_path = root / "calibration.json"
            calibration = DetectorCalibrator().run(
                controls_path,
                [control_results_path],
                calibration_path,
                minimum_calibration_rows=100,
                minimum_evaluation_rows=20,
            )

            for language in ("en", "it"):
                cell = calibration["detectors"]["alpha"]["languages"][language]
                self.assertEqual(cell["operator"], "gt")
                self.assertEqual(cell["threshold"], 98.0)
                self.assertEqual(cell["calibration_false_positives"], 1)
                self.assertEqual(cell["evaluation_false_positives"], 0)

            selections = root / "selections.jsonl"
            write_jsonl(selections, self._selections())
            GenericCorpusBuilder().run(selections, root / "corpus")
            documents = read_jsonl(root / "corpus" / "documents.jsonl")
            benchmark_results = root / "alpha" / "results.jsonl"
            write_jsonl(
                benchmark_results,
                [
                    {
                        "detector_id": "alpha",
                        "document_id": document["document_id"],
                        "text_sha256": document["text_sha256"],
                        "language": document["language"],
                        "status": "success",
                        "score": 99.0 if document["role"] == "ai_original" else 0.0,
                        "score_name": "test",
                        "score_direction": "higher_is_ai",
                        "native_ai_detected": False,
                        "model_version": "test-v1",
                    }
                    for document in documents
                ],
            )
            summary = GenericDetectorReport().run(
                root / "corpus" / "documents.jsonl",
                [benchmark_results],
                root / "report",
                calibration_path=calibration_path,
            )
            self.assertEqual(
                summary["metrics"]["alpha"]["en"]["original"]["ai_detected"], 1
            )
            self.assertEqual(
                summary["metrics"]["alpha"]["en"]["pipelines"]["bira"][
                    "conditional_evasion"
                ]["rate"],
                1.0,
            )
            self.assertEqual(
                summary["calibration_status"],
                "local-per-detector-language-human-controls",
            )

    def test_detector_without_native_threshold_is_not_counted_as_human(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            selections = root / "selections.jsonl"
            write_jsonl(selections, self._selections())
            GenericCorpusBuilder().run(selections, root / "corpus")
            documents = read_jsonl(root / "corpus" / "documents.jsonl")
            results_path = root / "logrank" / "results.jsonl"
            write_jsonl(
                results_path,
                [
                    {
                        "detector_id": "logrank",
                        "document_id": document["document_id"],
                        "text_sha256": document["text_sha256"],
                        "language": document["language"],
                        "status": "success",
                        "score": -1.0,
                        "score_name": "negative_mean_log_rank",
                        "score_direction": "higher_is_ai",
                        "native_ai_detected": None,
                    }
                    for document in documents
                ],
            )
            summary = GenericDetectorReport().run(
                root / "corpus" / "documents.jsonl",
                [results_path],
                root / "report",
            )
            original = summary["metrics"]["logrank"]["en"]["original"]
            self.assertEqual(original["rows"], 0)
            self.assertEqual(original["undecided_rows"], 1)
            self.assertIsNone(original["detection_rate"])

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
