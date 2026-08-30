from __future__ import annotations

import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from typing import Any

from unmarker_text_bench.adaptive_cascade import (
    AdaptiveRewriteCascade,
    CandidateEvaluation,
    CascadeCandidate,
    CascadeRequest,
    GenerationCall,
    JudgeSignals,
    ModelRoute,
    calibrated_detector_signal,
    pareto_front,
    select_from_pareto,
)
from unmarker_text_bench.adaptive_cli import AdaptiveBatchRunner
from unmarker_text_bench.adaptive_evaluation import (
    CalibratedGenericDetector,
    CompositeCascadeEvaluator,
)
from unmarker_text_bench.adaptive_holdout import build_controlled_holdout
from unmarker_text_bench.adaptive_modal import (
    ModalCascadeEvaluator,
    ModalEntityExtractor,
)
from unmarker_text_bench.openrouter_backend import RewriteResponse
from unmarker_text_bench.protected_spans import (
    EntitySpan,
    ProtectedSpanRecord,
    extract_structured,
    validate_record,
)
from unmarker_text_bench.remote_evaluation import NeuralQualityResult

SOURCE = (
    "Alice works at Acme in Rome on 2026-08-30. She does not modify 24 Atlas reports."
)
REWRITE = (
    "Alice is employed at Acme in Rome on 2026-08-30. "
    "She does not alter 24 Atlas reports."
)


class FakeRewriter:
    def __init__(self, model: str) -> None:
        self.model = model
        self.calls: list[dict[str, Any]] = []

    @property
    def metadata(self) -> dict[str, Any]:
        return {"model": self.model}

    def rewrite(
        self,
        system_prompt: str,
        user_prompt: str,
        logit_bias: dict[int | str, float] | None = None,
        seed: int | None = None,
    ) -> RewriteResponse:
        self.calls.append(
            {
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
                "logit_bias": logit_bias,
                "seed": seed,
            }
        )
        if "Extract a compact ordered outline" in user_prompt:
            text = "Alice; Acme; Rome; 2026-08-30; no modification; 24 Atlas reports."
        elif "Translate SOURCE into" in user_prompt:
            text = "Alice travaille chez Acme à Rome le 2026-08-30; 24 rapports Atlas inchangés."
        elif "<TARGET>" in user_prompt:
            text = f"{REWRITE} Contextual."
        elif "<OUTLINE>" in user_prompt:
            text = f"{REWRITE} Structural."
        else:
            text = REWRITE
        return RewriteResponse(
            text=text,
            request_id=f"request-{len(self.calls)}",
            model=self.model,
            provider="fake",
            prompt_tokens=20,
            completion_tokens=20,
            cost_usd=0.001,
            latency_ms=10.0,
        )


class FakeEntities:
    @property
    def metadata(self) -> dict[str, Any]:
        return {"implementation": "fake-gliner"}

    def extract(self, text: str, language: str) -> list[EntitySpan]:
        values = []
        for surface, label in (
            ("Alice", "person"),
            ("Acme", "organization"),
            ("Rome", "location"),
            ("Atlas", "product"),
        ):
            start = text.find(surface)
            if start >= 0:
                values.append(
                    EntitySpan(surface, start, start + len(surface), label, 0.99)
                )
        return values


class FakeEvaluator:
    def __init__(
        self, accepting_stage: str = "conservative", target: bool = False
    ) -> None:
        self.accepting_stage = accepting_stage
        self.target = target
        self.batches: list[list[str]] = []

    @property
    def metadata(self) -> dict[str, Any]:
        return {"implementation": "fake-batch-evaluator"}

    def evaluate_batch(
        self,
        request: CascadeRequest,
        candidates: list[CascadeCandidate],
        protected_record: ProtectedSpanRecord,
    ) -> list[CandidateEvaluation]:
        self.batches.append([value.stage for value in candidates])
        output = []
        for candidate in candidates:
            clear = candidate.stage == self.accepting_stage
            generic = calibrated_detector_signal(
                "generic-one",
                "generic",
                0.2 if clear else 0.8,
                0.5,
                "gt",
            )
            signals = [generic]
            if self.target:
                signals.append(
                    calibrated_detector_signal(
                        "markllm_exp",
                        "target",
                        0.2 if clear else 0.8,
                        0.5,
                        "gt",
                    )
                )
            output.append(
                CandidateEvaluation(
                    candidate=candidate,
                    deterministic_quality={"passes": True, "failure_reasons": []},
                    semantic_similarity=0.97,
                    bidirectional_entailment=0.94,
                    judge=JudgeSignals(False, 5, 5, True),
                    detector_signals=tuple(signals),
                )
            )
        return output


class FakePositionAware:
    def __init__(self) -> None:
        self.calls = 0

    @property
    def metadata(self) -> dict[str, Any]:
        return {"implementation": "fake-position-aware"}

    def supports(self, route: ModelRoute) -> bool:
        return True

    def generate(
        self,
        request: CascadeRequest,
        route: ModelRoute,
        protected_record: ProtectedSpanRecord,
        strength: float,
        seed: int,
    ) -> CascadeCandidate:
        self.calls += 1
        return CascadeCandidate(
            candidate_id=f"{request.request_id}|position|{route.route_id}",
            text=f"{REWRITE} {route.route_id}",
            stage="position_aware_bira",
            route_id=route.route_id,
            model_family=route.family,
            strength=strength,
            calls=(
                GenerationCall(
                    "position_aware_bira",
                    route.route_id,
                    route.family,
                    {"seed": seed},
                ),
            ),
        )


class AdaptiveCascadeTests(unittest.TestCase):
    def routes(self) -> list[ModelRoute]:
        return [
            ModelRoute("route-a", "family-a", FakeRewriter("model-a")),
            ModelRoute("route-b", "family-b", FakeRewriter("model-b")),
        ]

    def test_conservative_round_evaluates_all_candidates_then_stops(self) -> None:
        evaluator = FakeEvaluator("conservative")
        cascade = AdaptiveRewriteCascade(self.routes(), evaluator, FakeEntities())
        result = cascade.run(
            CascadeRequest("case-1", SOURCE, "en", terminology=("Atlas",))
        )

        self.assertEqual(result.status, "accepted")
        self.assertEqual(result.selected.candidate.stage, "conservative")
        self.assertEqual(evaluator.batches[0], ["original"])
        self.assertEqual(
            evaluator.batches[1],
            ["conservative", "conservative", "conservative"],
        )
        self.assertEqual(len(result.rounds), 1)
        self.assertEqual(
            {value.family for value in result.selected.candidate.calls},
            {result.selected.candidate.model_family},
        )

    def test_fallback_advances_to_contextual_chunks(self) -> None:
        evaluator = FakeEvaluator("contextual_chunk")
        cascade = AdaptiveRewriteCascade(self.routes(), evaluator, FakeEntities())
        result = cascade.run(CascadeRequest("case-2", SOURCE, "en"))

        self.assertEqual(result.status, "accepted")
        self.assertEqual(result.selected.candidate.stage, "contextual_chunk")
        self.assertEqual(
            [row[0] for row in evaluator.batches],
            [
                "original",
                "conservative",
                "contextual_chunk",
            ],
        )
        self.assertFalse(result.selected.candidate.metadata["chunk_shuffle"])

    def test_known_generator_family_is_excluded(self) -> None:
        routes = self.routes()
        evaluator = FakeEvaluator("conservative")
        cascade = AdaptiveRewriteCascade(routes, evaluator, FakeEntities())
        result = cascade.run(
            CascadeRequest("case-3", SOURCE, "en", generator_family="family-a")
        )

        self.assertEqual(result.selected.candidate.model_family, "family-b")
        self.assertFalse(routes[0].rewriter.calls)

    def test_unknown_generator_requires_two_families(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least two"):
            AdaptiveRewriteCascade(
                [ModelRoute("only", "one-family", FakeRewriter("only"))],
                FakeEvaluator(),
                FakeEntities(),
            ).run(CascadeRequest("case-4", SOURCE, "en"))

    def test_position_aware_runs_only_with_compatible_target_signal(self) -> None:
        position = FakePositionAware()
        evaluator = FakeEvaluator("position_aware_bira", target=True)
        cascade = AdaptiveRewriteCascade(
            self.routes(), evaluator, FakeEntities(), position_aware=position
        )
        result = cascade.run(
            CascadeRequest("case-5", SOURCE, "en", target_algorithm="EXP")
        )

        self.assertEqual(result.selected.candidate.stage, "position_aware_bira")
        self.assertEqual(position.calls, 2)

    def test_date_and_terminology_are_exact_protected_fields(self) -> None:
        record = ProtectedSpanRecord.build(
            SOURCE,
            "en",
            FakeEntities().extract(SOURCE, "en"),
            terminology=("Atlas",),
        )
        self.assertEqual(record.structured["dates"], ["2026-08-30"])
        self.assertEqual(record.structured["terminology"], ["Atlas"])
        invalid = REWRITE.replace("2026-08-30", "2026-08-31").replace("Atlas", "Orion")
        quality = validate_record(record, invalid, original_text=SOURCE)
        self.assertFalse(quality["dates_preserved"])
        self.assertFalse(quality["terminology_preserved"])

    def test_extract_structured_deduplicates_requested_terminology(self) -> None:
        structured = extract_structured(SOURCE, "en", ("Atlas", "Atlas", "Missing"))
        self.assertEqual(structured["terminology"], ["Atlas"])

    def test_pareto_selection_keeps_non_dominated_candidates(self) -> None:
        evaluator = FakeEvaluator()
        request = CascadeRequest("pareto", SOURCE, "en")
        record = ProtectedSpanRecord.build(SOURCE, "en", [])
        candidates = [
            CascadeCandidate("low-edit", REWRITE, "test", "a", "a", 0.2, ()),
            CascadeCandidate("low-risk", REWRITE, "test", "b", "b", 0.2, ()),
            CascadeCandidate("dominated", REWRITE, "test", "c", "c", 0.2, ()),
        ]
        base = evaluator.evaluate_batch(request, candidates, record)
        evaluations = [
            replace(base[0], changed_token_ratio=0.1, semantic_similarity=0.95),
            replace(
                base[1],
                changed_token_ratio=0.2,
                semantic_similarity=0.99,
                detector_signals=(
                    calibrated_detector_signal(
                        "generic-one", "generic", 0.1, 0.5, "gt"
                    ),
                ),
            ),
            replace(base[2], changed_token_ratio=0.3, semantic_similarity=0.90),
        ]
        front = pareto_front(evaluations)

        self.assertEqual(
            {value.candidate.candidate_id for value in front}, {"low-edit", "low-risk"}
        )
        self.assertEqual(select_from_pareto(front).candidate.candidate_id, "low-risk")


class DetectorSignalTests(unittest.TestCase):
    def test_lower_is_ai_margin_has_consistent_sign(self) -> None:
        detected = calibrated_detector_signal("b", "generic", 0.7, 0.8, "lt")
        clear = calibrated_detector_signal("b", "generic", 0.9, 0.8, "lt")
        self.assertTrue(detected.detected)
        self.assertGreater(detected.calibrated_margin, 0)
        self.assertFalse(clear.detected)
        self.assertLess(clear.calibrated_margin, 0)


class AdaptiveBatchRunnerTests(unittest.TestCase):
    def test_runner_resumes_successes_and_isolates_item_errors(self) -> None:
        evaluator = FakeEvaluator("conservative")
        cascade = AdaptiveRewriteCascade(
            [
                ModelRoute("a", "family-a", FakeRewriter("model-a")),
                ModelRoute("b", "family-b", FakeRewriter("model-b")),
            ],
            evaluator,
            FakeEntities(),
        )
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            input_path = root / "input.jsonl"
            output_path = root / "output.jsonl"
            input_path.write_text(
                "\n".join(
                    json.dumps(value)
                    for value in (
                        {
                            "request_id": "valid",
                            "language": "en",
                            "text": SOURCE,
                        },
                        {
                            "request_id": "invalid",
                            "language": "fr",
                            "text": SOURCE,
                        },
                    )
                )
                + "\n",
                encoding="utf-8",
            )
            runner = AdaptiveBatchRunner(cascade)
            first = runner.run(
                input_path,
                output_path,
                manifest_inputs={"config": "test"},
            )
            calls_after_first = len(evaluator.batches)
            second = runner.run(
                input_path,
                output_path,
                manifest_inputs={"config": "test"},
            )
            rows = [
                json.loads(line)
                for line in output_path.read_text(encoding="utf-8").splitlines()
            ]

            self.assertEqual(first["succeeded"], 1)
            self.assertEqual(first["failed"], 1)
            self.assertEqual(second, first)
            self.assertEqual(len(evaluator.batches), calls_after_first)
            self.assertEqual(
                [value["request_id"] for value in rows], ["valid", "invalid"]
            )
            self.assertEqual(rows[0]["cascade_status"], "accepted")
            self.assertEqual(rows[1]["error_type"], "ValueError")


class ModalAdaptiveAdapterTests(unittest.TestCase):
    def test_modal_round_joins_quality_and_all_detector_results(self) -> None:
        calls: list[tuple[str, str]] = []

        def invoker(
            app_name: str,
            function_name: str,
            arguments: tuple[Any, ...],
        ) -> dict[str, Any]:
            calls.append((app_name, function_name))
            if function_name == "adaptive_extract_entities":
                return {
                    "entities": [
                        {
                            "text": "Alice",
                            "start": 0,
                            "end": 5,
                            "label": "person",
                            "score": 0.99,
                        }
                    ]
                }
            documents = (
                arguments[2]
                if function_name == "adaptive_quality_batch"
                else arguments[0]
            )
            if function_name == "adaptive_quality_batch":
                return {
                    "rows": [
                        {
                            "candidate_id": value["candidate_id"],
                            "semantic_similarity": 0.97,
                            "bidirectional_entailment": 0.94,
                            "deterministic_quality": {
                                "passes": True,
                                "failure_reasons": [],
                            },
                        }
                        for value in documents
                    ]
                }
            if function_name == "adaptive_binoculars_batch":
                return {
                    "rows": [
                        {
                            "candidate_id": value["candidate_id"],
                            "score": 0.9,
                            "model_version": "b-v1",
                        }
                        for value in documents
                    ]
                }
            if function_name == "adaptive_fast_detect_batch":
                return {
                    "detectors": {
                        detector_id: {
                            "rows": [
                                {
                                    "candidate_id": value["candidate_id"],
                                    "score": 0.1,
                                    "model_version": "f-v1",
                                }
                                for value in documents
                            ]
                        }
                        for detector_id in ("fast_detect_gpt", "logrank")
                    }
                }
            if function_name == "adaptive_radar_batch":
                return {
                    "rows": [
                        {
                            "candidate_id": value["candidate_id"],
                            "score": 0.1,
                            "model_version": "r-v1",
                        }
                        for value in documents
                    ]
                }
            raise AssertionError(function_name)

        calibration = {
            "artifact_kind": "test-calibration",
            "detectors": {
                detector_id: {
                    "languages": {
                        language: {
                            "threshold": 0.8 if detector_id == "binoculars" else 0.5,
                            "operator": "lt" if detector_id == "binoculars" else "gt",
                        }
                        for language in ("en", "it")
                    }
                }
                for detector_id in (
                    "binoculars",
                    "fast_detect_gpt",
                    "logrank",
                    "radar",
                )
            },
        }
        extractor = ModalEntityExtractor(
            {"en": 0.9, "it": 0.8},
            ("person",),
            invoker=invoker,
        )
        entities = extractor.extract(SOURCE, "en")
        record = ProtectedSpanRecord.build(SOURCE, "en", entities)
        evaluator = ModalCascadeEvaluator(
            calibration,
            {"en": 0.9, "it": 0.8},
            ("person",),
            judge=None,
            invoker=invoker,
        )
        request = CascadeRequest("modal", SOURCE, "en")
        candidate = CascadeCandidate(
            "modal|candidate",
            REWRITE,
            "conservative",
            "a",
            "family-a",
            0.2,
            (),
        )
        result = evaluator.evaluate_batch(request, [candidate], record)[0]

        self.assertEqual(len(result.detector_signals), 4)
        self.assertTrue(all(not value.detected for value in result.detector_signals))
        self.assertEqual(result.deterministic_quality["passes"], True)
        self.assertEqual(
            {function for _, function in calls},
            {
                "adaptive_extract_entities",
                "adaptive_quality_batch",
                "adaptive_binoculars_batch",
                "adaptive_fast_detect_batch",
                "adaptive_radar_batch",
            },
        )


class CompositeAdaptiveEvaluatorTests(unittest.TestCase):
    def test_local_composition_uses_calibrated_detector_and_exact_quality(self) -> None:
        class Quality:
            @property
            def metadata(self) -> dict[str, Any]:
                return {"implementation": "fake-neural-quality"}

            def evaluate_pairs(
                self, pairs: list[tuple[str, str]]
            ) -> list[NeuralQualityResult]:
                return [NeuralQualityResult(0.97, 0.95, 0.94) for _ in pairs]

        class Detector:
            detector_id = "local-detector"

            @property
            def metadata(self) -> dict[str, Any]:
                return {"implementation": "fake-local-detector"}

            def detect(self, document: dict[str, Any]) -> dict[str, Any]:
                return {
                    "status": "success",
                    "score": 0.2,
                    "model_version": "local-v1",
                }

        class Judge:
            @property
            def metadata(self) -> dict[str, Any]:
                return {"implementation": "fake-local-judge"}

            def evaluate(
                self,
                request: CascadeRequest,
                candidate: CascadeCandidate,
            ) -> JudgeSignals:
                return JudgeSignals(False, 5, 5, True)

        detector = CalibratedGenericDetector(
            Detector(),
            thresholds={"en": 0.5, "it": 0.5},
            operators={"en": "gt", "it": "gt"},
        )
        evaluator = CompositeCascadeEvaluator(
            Quality(),
            FakeEntities(),
            [detector],
            Judge(),
        )
        request = CascadeRequest("local", SOURCE, "en", terminology=("Atlas",))
        record = ProtectedSpanRecord.build(
            SOURCE,
            "en",
            FakeEntities().extract(SOURCE, "en"),
            terminology=request.terminology,
        )
        candidate = CascadeCandidate(
            "local|candidate",
            REWRITE,
            "conservative",
            "a",
            "family-a",
            0.2,
            (),
        )
        result = evaluator.evaluate_batch(request, [candidate], record)[0]

        self.assertTrue(result.deterministic_quality["passes"])
        self.assertEqual(result.semantic_similarity, 0.97)
        self.assertEqual(result.bidirectional_entailment, 0.94)
        self.assertFalse(result.detector_signals[0].detected)


class AdaptiveHoldoutTests(unittest.TestCase):
    def test_builder_selects_only_detected_held_out_rows_deterministically(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            generations = []
            candidates = []
            for language, threshold in (("en", 2.4), ("it", 1.7)):
                for index in range(4):
                    sample_id = f"sample-{language}-{index}"
                    generations.append(
                        {
                            "sample_id": sample_id,
                            "language": language,
                            "split": "evaluation",
                            "algorithm": "EXP",
                            "watermarked_text": f"Watermarked {language} {index}",
                            "calibrated_threshold_1pct": threshold,
                            "calibrated_watermarked_detected": index != 3,
                        }
                    )
                    candidates.append(
                        {
                            "sample_id": sample_id,
                            "algorithm": "EXP",
                            "attack_split": (
                                "development" if index == 0 else "held_out_test"
                            ),
                        }
                    )
            generations_path = root / "generations.jsonl"
            candidates_path = root / "candidates.jsonl"
            generations_path.write_text(
                "".join(json.dumps(row) + "\n" for row in generations),
                encoding="utf-8",
            )
            candidates_path.write_text(
                "".join(json.dumps(row) + "\n" for row in candidates),
                encoding="utf-8",
            )

            manifest = build_controlled_holdout(
                generations_path,
                candidates_path,
                root / "output",
                per_language=2,
                seed=7,
            )
            requests = [
                json.loads(line)
                for line in (root / "output" / "input.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            target = json.loads(
                (root / "output" / "target-config.json").read_text(
                    encoding="utf-8"
                )
            )

            self.assertEqual(manifest["request_count"], 4)
            self.assertEqual(manifest["eligible_counts"], {"en": 2, "it": 2})
            self.assertEqual({row["generator_family"] for row in requests}, {"qwen"})
            self.assertEqual({row["target_algorithm"] for row in requests}, {"EXP"})
            self.assertEqual(target["thresholds"]["EXP"], {"en": 2.4, "it": 1.7})


if __name__ == "__main__":
    unittest.main()
