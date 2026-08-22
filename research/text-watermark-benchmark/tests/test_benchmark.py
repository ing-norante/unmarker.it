from __future__ import annotations

import csv
import hashlib
import json
import tempfile
import unittest
import urllib.request
from dataclasses import asdict
from pathlib import Path
from typing import ClassVar

from unmarker_text_bench.attack_pipeline import AttackConfig, AttackRunner
from unmarker_text_bench.final_report import FinalReportRunner
from unmarker_text_bench.language_model import ReferenceNgramScorer
from unmarker_text_bench.lexicon import VariantLexicon
from unmarker_text_bench.llm_judge import LlmJudgeRunner
from unmarker_text_bench.markllm_backend import (
    markllm_algorithm_capabilities,
    normalize_detection_result,
)
from unmarker_text_bench.markllm_gate import (
    DetectionResult,
    Gate2Config,
    MarkLLMGateRunner,
    PromptSample,
)
from unmarker_text_bench.ner_gold import NerThresholdCalibrator
from unmarker_text_bench.openrouter_backend import (
    OpenRouterError,
    OpenRouterRewriter,
    RewriteResponse,
    StructuredResponse,
)
from unmarker_text_bench.protected_spans import (
    EntitySpan,
    ProtectedSpanIndex,
    ProtectedSpanRecord,
    protected_prompt_fragment,
    validate_record,
)
from unmarker_text_bench.quality_checks import extract_protected
from unmarker_text_bench.remote_evaluation import (
    CandidateEvaluationRunner,
    NeuralQualityResult,
)
from unmarker_text_bench.runner import BenchmarkConfig, BenchmarkRunner
from unmarker_text_bench.self_information import (
    TokenSurprisal,
    mask_selected_tokens,
    select_high_information,
)
from unmarker_text_bench.strategies import PositionAwareBiraPipeline
from unmarker_text_bench.tokenization import (
    extract_numbers,
    extract_urls,
    replace_tokens,
    tokenize,
)
from unmarker_text_bench.types import Sample
from unmarker_text_bench.unicode_hygiene import clean_unicode
from unmarker_text_bench.validators import QualityValidator
from unmarker_text_bench.watermarks import KgwSurrogate

SAMPLES = [
    Sample(
        "en-test",
        "en",
        "The important team will use a simple method to test the secure system. "
        "Elena Rossi will check 24 reports at https://example.org and will not change the data.",
    ),
    Sample(
        "it-test",
        "it",
        "Il gruppo importante vuole usare un metodo semplice per testare il sistema sicuro. "
        "Elena Rossi controllerà 24 rapporti su https://example.org e non cambierà i dati.",
    ),
]


class TokenizationTests(unittest.TestCase):
    def test_noop_replacement_round_trips(self) -> None:
        text = SAMPLES[0].text
        self.assertEqual(replace_tokens(text, tokenize(text), {}), text)

    def test_protected_values_are_extracted(self) -> None:
        self.assertEqual(extract_numbers(SAMPLES[0].text), ("24",))
        self.assertEqual(extract_urls(SAMPLES[0].text), ("https://example.org",))

    def test_italian_apostrophes_are_not_quotations(self) -> None:
        protected = extract_protected(
            "L'architettura dell'evento non contiene una citazione.", "it"
        )
        self.assertEqual(protected["quotations"], [])


class UnicodeHygieneTests(unittest.TestCase):
    def test_removes_high_confidence_carriers_and_normalizes_spaces(self) -> None:
        result = clean_unicode("alpha\u200bbeta\u00adgamma\u00a0delta")
        self.assertEqual(result.text, "alphabetagamma delta")
        self.assertTrue(result.changed)
        self.assertEqual(result.removed_count, 2)
        self.assertEqual(result.replaced_count, 1)

    def test_preserves_emoji_and_script_join_controls(self) -> None:
        text = "👩\u200d💻 می\u200cرود"
        result = clean_unicode(text)
        self.assertEqual(result.text, text)
        self.assertFalse(result.changed)
        self.assertEqual(result.preserved_or_reported_count, 2)

    def test_bidi_overrides_are_removed_but_balanced_isolates_survive(self) -> None:
        text = "safe \u202eabc\u202c and \u2067שלום\u2069"
        result = clean_unicode(text)
        self.assertEqual(result.text, "safe abc and \u2067שלום\u2069")
        self.assertEqual(result.removed_count, 2)

    def test_valid_subdivision_flag_tags_survive(self) -> None:
        flag = "\U0001f3f4\U000e0067\U000e0062\U000e0065\U000e006e\U000e0067\U000e007f"
        self.assertEqual(clean_unicode(flag).text, flag)

    def test_nfkc_is_explicit(self) -> None:
        self.assertEqual(clean_unicode("①").text, "①")
        self.assertEqual(clean_unicode("①", nfkc=True).text, "1")


class PipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.lexicon = VariantLexicon.default()
        self.scorer = ReferenceNgramScorer(SAMPLES, self.lexicon)

    def test_position_aware_preserves_protected_content(self) -> None:
        pipeline = PositionAwareBiraPipeline(self.lexicon, self.scorer)
        candidate = pipeline.rewrite(SAMPLES[0].text, "en", "aggressive", 0.5)
        report = QualityValidator(self.lexicon).evaluate(
            SAMPLES[0].text, candidate.text, "en"
        )
        self.assertTrue(report.entities_preserved)
        self.assertTrue(report.numbers_preserved)
        self.assertTrue(report.urls_preserved)
        self.assertEqual(report.negation_preservation, 1.0)

    def test_surrogate_watermark_strengthens_detector_score(self) -> None:
        detector = KgwSurrogate("test-key", self.lexicon, self.scorer)
        detector.calibrate(SAMPLES, null_keys=64)
        watermarked = [
            detector.embed(sample.text, sample.language) for sample in SAMPLES
        ]
        clean_scores = [
            detector.score(sample.text, sample.language) for sample in SAMPLES
        ]
        marked_scores = [
            detector.score(text, sample.language)
            for text, sample in zip(watermarked, SAMPLES)
        ]
        self.assertGreater(sum(marked_scores), sum(clean_scores))

    def test_embedder_and_rewriter_candidate_outputs_are_disjoint(self) -> None:
        for language in ("en", "it"):
            self.assertEqual(self.lexicon.candidate_overlap(language), set())
            for group in self.lexicon.groups[language]:
                self.assertTrue(set(group[:2]).isdisjoint(group[2:]))


class RunnerTests(unittest.TestCase):
    def test_runner_writes_expected_artifacts(self) -> None:
        runner = BenchmarkRunner(SAMPLES, BenchmarkConfig(calibration_null_keys=16))
        with tempfile.TemporaryDirectory() as directory:
            summary = runner.run(Path(directory))
            self.assertEqual(
                summary["benchmark_scope"], "controlled_decoupled_surrogates"
            )
            self.assertIn(
                "bira_position_aware",
                summary["progressive_all_cells_by_pipeline"],
            )
            self.assertTrue((Path(directory) / "runs.csv").exists())
            payload = json.loads((Path(directory) / "summary.json").read_text())
            self.assertEqual(payload["source_passage_count"], 2)
            self.assertEqual(payload["composed_document_count"], 2)
            self.assertFalse(
                payload["candidate_set_protocol"]["shared_candidate_outputs"]
            )
            with (Path(directory) / "runs.csv").open(
                newline="", encoding="utf-8"
            ) as handle:
                rows = list(csv.DictReader(handle))
            attack_rows = [row for row in rows if row["pipeline"] != "no_attack"]
            attempts_per_case: dict[tuple[str, str, str], int] = {}
            for row in attack_rows:
                key = (row["sample_id"], row["watermark"], row["pipeline"])
                attempts_per_case[key] = attempts_per_case.get(key, 0) + 1
            self.assertTrue(attempts_per_case)
            self.assertTrue(all(count == 3 for count in attempts_per_case.values()))
            positions_by_case_budget: dict[tuple[str, str, str], set[int]] = {}
            for row in attack_rows:
                key = (row["sample_id"], row["watermark"], row["budget"])
                positions_by_case_budget.setdefault(key, set()).add(
                    int(row["changed_positions"])
                )
            self.assertTrue(
                all(len(counts) == 1 for counts in positions_by_case_budget.values())
            )


class FakeMarkLLMBackend:
    def __init__(self) -> None:
        self.unwatermarked_calls = 0
        self.watermarked_calls = 0

    @property
    def metadata(self) -> dict[str, str]:
        return {"implementation": "fake-markllm", "model": "fake-model"}

    def generate_unwatermarked(self, prompt: str, seed: int) -> str:
        self.unwatermarked_calls += 1
        return f"Plain generated continuation for seed {seed} and prompt {prompt}"

    def generate_watermarked(self, algorithm: str, prompt: str, seed: int) -> str:
        self.watermarked_calls += 1
        return f"[WM:{algorithm}] Generated continuation for seed {seed} and prompt {prompt}"

    def detect(self, algorithm: str, text: str) -> DetectionResult:
        marked = f"[WM:{algorithm}]" in text
        return DetectionResult(marked, 0.9 if marked else 0.1)

    def count_tokens(self, text: str) -> int:
        return len(text.split())


class MarkLLMGateTests(unittest.TestCase):
    prompts: ClassVar[list[PromptSample]] = [
        PromptSample(
            "en-1",
            "en",
            "test",
            "calibration",
            "Explain a sufficiently detailed English topic.",
        ),
        PromptSample(
            "en-2",
            "en",
            "test",
            "evaluation",
            "Describe a second independent English topic.",
        ),
        PromptSample(
            "it-1",
            "it",
            "test",
            "calibration",
            "Spiega un argomento italiano sufficientemente dettagliato.",
        ),
        PromptSample(
            "it-2",
            "it",
            "test",
            "evaluation",
            "Descrivi un secondo argomento italiano indipendente.",
        ),
    ]

    def test_evidence_run_rejects_small_prompt_sets(self) -> None:
        with self.assertRaisesRegex(
            ValueError, "independent calibration and evaluation prompts"
        ):
            MarkLLMGateRunner(self.prompts, FakeMarkLLMBackend())

    def test_smoke_run_generates_once_per_prompt_and_writes_artifacts(self) -> None:
        backend = FakeMarkLLMBackend()
        config = Gate2Config(min_generated_tokens=1, allow_small_smoke=True)
        runner = MarkLLMGateRunner(self.prompts, backend, config)
        with tempfile.TemporaryDirectory() as directory:
            summary = runner.run(Path(directory))
            self.assertEqual(backend.unwatermarked_calls, len(self.prompts))
            self.assertEqual(backend.watermarked_calls, 8)
            self.assertEqual(summary["source_prompt_count"], 4)
            self.assertFalse(summary["lexicon_used_for_generation"])
            self.assertEqual(len(summary["cells"]), 8)
            self.assertTrue((Path(directory) / "generations.jsonl").exists())
            self.assertTrue((Path(directory) / "config.json").exists())
            self.assertTrue(
                all(
                    cell["watermarked_tpr_at_calibrated_threshold"] == 1.0
                    for cell in summary["cells"]
                )
            )

    def test_resume_skips_completed_generation_calls(self) -> None:
        config = Gate2Config(min_generated_tokens=1, allow_small_smoke=True)
        with tempfile.TemporaryDirectory() as directory:
            first = FakeMarkLLMBackend()
            MarkLLMGateRunner(self.prompts, first, config).run(Path(directory))
            resumed = FakeMarkLLMBackend()
            MarkLLMGateRunner(self.prompts, resumed, config).run(Path(directory))
            self.assertEqual(resumed.unwatermarked_calls, 0)
            self.assertEqual(resumed.watermarked_calls, 0)
            self.assertTrue((Path(directory) / "input-manifest.json").exists())

    def test_no_resume_replaces_raw_checkpoint(self) -> None:
        config = Gate2Config(min_generated_tokens=1, allow_small_smoke=True)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            MarkLLMGateRunner(self.prompts, FakeMarkLLMBackend(), config).run(output)
            raw_path = output / "raw-generations.jsonl"
            with raw_path.open("a", encoding="utf-8") as handle:
                handle.write("{}\n")
            backend = FakeMarkLLMBackend()
            MarkLLMGateRunner(self.prompts, backend, config).run(output, resume=False)
            self.assertEqual(
                len([line for line in raw_path.read_text().splitlines() if line]), 16
            )
            self.assertEqual(backend.unwatermarked_calls, 4)


class MarkLLMBackendContractTests(unittest.TestCase):
    def test_p_values_are_put_on_higher_is_more_watermarked_axis(self) -> None:
        detection = normalize_detection_result(
            "EXP", {"is_watermarked": True, "score": 1e-4}
        )
        self.assertTrue(detection.detected)
        self.assertAlmostEqual(detection.score, 4.0)

    def test_expgumbel_dense_allocation_is_rejected_for_qwen_vocab(self) -> None:
        capabilities = markllm_algorithm_capabilities(("EXP", "EXPGumbel"), 151_936)
        self.assertTrue(capabilities["EXP"]["supported"])
        self.assertFalse(capabilities["EXPGumbel"]["supported"])
        self.assertGreater(
            capabilities["EXPGumbel"]["minimum_dense_table_bytes"], 300 * 1024**3
        )


class SelfInformationTests(unittest.TestCase):
    scores: ClassVar[list[TokenSurprisal]] = [
        TokenSurprisal(index, index, text, start, end, score)
        for index, (text, start, end, score) in enumerate(
            [
                ("one", 0, 3, 1.0),
                ("two", 4, 7, 5.0),
                ("three", 8, 13, 4.0),
                ("four", 14, 18, 3.0),
                ("five", 19, 23, 2.0),
            ],
            start=1,
        )
    ]

    def test_position_aware_selection_keeps_exact_budget(self) -> None:
        selected = select_high_information(self.scores, 0.6, minimum_spacing=1)
        self.assertEqual(len(selected), 3)
        self.assertEqual({row.index for row in selected}, {2, 3, 4})

    def test_mask_uses_source_offsets(self) -> None:
        masked = mask_selected_tokens(
            "one two three four five", [self.scores[1], self.scores[3]]
        )
        self.assertEqual(masked, "one [BLANK] three [BLANK] five")


class OpenRouterTests(unittest.TestCase):
    def test_structured_completion_sends_strict_schema(self) -> None:
        requests: list[urllib.request.Request] = []

        def transport(
            request: urllib.request.Request, timeout: float
        ) -> tuple[int, bytes]:
            requests.append(request)
            return 200, json.dumps(
                {
                    "id": "structured-1",
                    "model": "test/model",
                    "provider": "test-provider",
                    "choices": [
                        {
                            "message": {"content": '{"passes": true}'},
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 8,
                        "completion_tokens": 3,
                        "cost": 0.001,
                    },
                }
            ).encode()

        client = OpenRouterRewriter(
            api_key="not-a-real-key",
            model="test/model",
            provider="test-provider",
            reasoning_effort="medium",
            transport=transport,
        )
        response = client.complete_json(
            "system",
            "user",
            "assessment",
            {
                "type": "object",
                "properties": {"passes": {"type": "boolean"}},
                "required": ["passes"],
                "additionalProperties": False,
            },
            seed=7,
        )
        self.assertEqual(response.data, {"passes": True})
        body = json.loads(requests[0].data)
        self.assertTrue(body["response_format"]["json_schema"]["strict"])
        self.assertEqual(body["seed"], 7)
        self.assertEqual(body["reasoning"]["effort"], "medium")
        self.assertNotIn("temperature", body)

    def test_client_records_provider_usage_and_bias(self) -> None:
        requests: list[urllib.request.Request] = []

        def transport(
            request: urllib.request.Request, timeout: float
        ) -> tuple[int, bytes]:
            requests.append(request)
            if request.full_url.endswith("/endpoints"):
                return 200, json.dumps(
                    {
                        "data": {
                            "endpoints": [
                                {
                                    "provider_name": "Together",
                                    "supported_parameters": ["logit_bias"],
                                    "status": 0,
                                }
                            ]
                        }
                    }
                ).encode()
            if request.full_url.endswith("/models"):
                return 200, json.dumps(
                    {
                        "data": [
                            {
                                "id": "test/model",
                                "reasoning": {
                                    "mandatory": True,
                                    "supported_efforts": ["low", "medium"],
                                },
                            }
                        ]
                    }
                ).encode()
            return 200, json.dumps(
                {
                    "id": "request-1",
                    "model": "test/model",
                    "provider": "Together",
                    "choices": [{"message": {"content": "Rewritten text"}}],
                    "usage": {
                        "prompt_tokens": 10,
                        "completion_tokens": 4,
                        "cost": 0.01,
                    },
                }
            ).encode()

        client = OpenRouterRewriter(
            api_key="not-a-real-key",
            model="test/model",
            provider="Together",
            reasoning_effort="low",
            transport=transport,
        )
        self.assertTrue(
            client.validate_capabilities(require_logit_bias=True)[
                "logit_bias_supported"
            ]
        )
        response = client.rewrite("system", "user", logit_bias={12: -4.0})
        body = json.loads(requests[-1].data)
        self.assertEqual(body["logit_bias"], {"12": -4.0})
        self.assertEqual(body["reasoning"], {"effort": "low", "exclude": True})
        self.assertEqual(response.cost_usd, 0.01)
        self.assertNotIn("not-a-real-key", json.dumps(client.metadata))

    def test_non_reasoning_model_omits_reasoning_parameter(self) -> None:
        requests: list[urllib.request.Request] = []

        def transport(
            request: urllib.request.Request, timeout: float
        ) -> tuple[int, bytes]:
            requests.append(request)
            return 200, json.dumps(
                {
                    "id": "request-1",
                    "model": "test/model",
                    "provider": "DeepInfra",
                    "choices": [{"message": {"content": "Rewritten text"}}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 4},
                }
            ).encode()

        client = OpenRouterRewriter(
            api_key="not-a-real-key",
            model="test/model",
            provider="DeepInfra",
            reasoning_effort="none",
            transport=transport,
        )
        client.rewrite("system", "user")
        self.assertNotIn("reasoning", json.loads(requests[-1].data))

    def test_empty_length_response_retries_with_larger_budget(self) -> None:
        requests: list[urllib.request.Request] = []

        def transport(
            request: urllib.request.Request, timeout: float
        ) -> tuple[int, bytes]:
            requests.append(request)
            body = json.loads(request.data)
            if len(requests) == 1:
                self.assertEqual(body["max_tokens"], 4096)
                return 200, json.dumps(
                    {
                        "id": "length-1",
                        "model": "test/model",
                        "provider": "DeepInfra",
                        "choices": [
                            {
                                "message": {"content": ""},
                                "finish_reason": "length",
                            }
                        ],
                        "usage": {
                            "prompt_tokens": 10,
                            "completion_tokens": 4096,
                            "cost": 0.02,
                            "completion_tokens_details": {"reasoning_tokens": 4096},
                        },
                    }
                ).encode()
            self.assertEqual(body["max_tokens"], 8192)
            return 200, json.dumps(
                {
                    "id": "success-2",
                    "model": "test/model",
                    "provider": "DeepInfra",
                    "choices": [
                        {
                            "message": {"content": "Recovered rewrite"},
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": 10,
                        "completion_tokens": 100,
                        "cost": 0.01,
                        "completion_tokens_details": {"reasoning_tokens": 80},
                    },
                }
            ).encode()

        client = OpenRouterRewriter(
            api_key="not-a-real-key",
            model="test/model",
            provider="DeepInfra",
            transport=transport,
        )
        response = client.rewrite("system", "user")
        self.assertEqual(response.text, "Recovered rewrite")
        self.assertEqual(response.request_ids, ("length-1", "success-2"))
        self.assertEqual(response.attempt_count, 2)
        self.assertEqual(response.length_retry_count, 1)
        self.assertEqual(response.max_tokens_used, 8192)
        self.assertEqual(response.prompt_tokens, 20)
        self.assertEqual(response.completion_tokens, 4196)
        self.assertEqual(response.reasoning_tokens, 4176)
        self.assertAlmostEqual(response.cost_usd or 0.0, 0.03)

    def test_http_200_upstream_error_is_not_treated_as_completion(self) -> None:
        def transport(
            request: urllib.request.Request, timeout: float
        ) -> tuple[int, bytes]:
            return 200, json.dumps(
                {"error": {"message": "provider rejected parameter", "code": 400}}
            ).encode()

        client = OpenRouterRewriter(
            api_key="not-a-real-key",
            model="test/model",
            provider="test-provider",
            max_retries=0,
            transport=transport,
        )
        with self.assertRaisesRegex(OpenRouterError, "provider rejected parameter"):
            client.rewrite("system", "user", logit_bias={12: -4.0})


class FakeBiasTokenizer:
    model_name = "fake-tokenizer"
    revision = "fake-revision"

    def __init__(self) -> None:
        self.tokenizer = self

    def __call__(
        self, text: str, add_special_tokens: bool = False
    ) -> dict[str, list[int]]:
        return {"input_ids": list(range(len(text.split())))}

    def build_bias(
        self, token_strings: list[str], bias: float, max_token_ids: int = 300
    ) -> dict[int, float]:
        return {index: bias for index, _ in enumerate(token_strings[:max_token_ids])}


class ProtectedSpanTests(unittest.TestCase):
    def test_manifest_validation_rejects_changed_and_introduced_entities(self) -> None:
        source = "Alice paid 42 euros to Acme Corp."
        record = ProtectedSpanRecord.build(
            source,
            "en",
            [
                EntitySpan("Alice", 0, 5, "person", 0.98),
                EntitySpan("Acme Corp", 23, 32, "organization", 0.95),
            ],
        )
        changed = validate_record(record, "Bob paid 42 euros to Acme Corp.")
        self.assertFalse(changed["passes"])
        self.assertIn("entities", changed["failure_reasons"])
        introduced = validate_record(
            record,
            source + " Paris approved it.",
            [
                *record.entities,
                EntitySpan("Paris", len(source) + 1, len(source) + 6, "location", 0.9),
            ],
        )
        self.assertFalse(introduced["passes"])
        self.assertIn("introduced_entities", introduced["failure_reasons"])
        self.assertIn("Alice", protected_prompt_fragment(record))

    def test_index_checks_text_hash_and_language(self) -> None:
        record = ProtectedSpanRecord.build("Alice works.", "en", [])
        index = ProtectedSpanIndex([record])
        self.assertEqual(index.get("Alice works.", "en"), record)
        with self.assertRaisesRegex(ValueError, "language=it"):
            index.get("Alice works.", "it")


class NerGoldTests(unittest.TestCase):
    def test_calibration_requires_explicit_human_approval(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "review.jsonl"
            rows = []
            for language in ("en", "it"):
                text = "Alice works."
                rows.append(
                    {
                        "sample_id": language,
                        "language": language,
                        "text": text,
                        "text_sha256": hashlib.sha256(text.encode()).hexdigest(),
                        "model_suggestions": [
                            {
                                "text": "Alice",
                                "start": 0,
                                "end": 5,
                                "label": "person",
                                "score": 0.62,
                            }
                        ],
                        "human_entities": [
                            {
                                "text": "Alice",
                                "start": 0,
                                "end": 5,
                                "label": "person",
                            }
                        ],
                        "review_status": "pending",
                        "reviewer": "",
                    }
                )
            RemotePipelineTests._write_jsonl(path, rows)
            with self.assertRaisesRegex(ValueError, "explicitly approved"):
                NerThresholdCalibrator().run(path, root / "thresholds.json")
            for row in rows:
                row["review_status"] = "approved"
                row["reviewer"] = "human-reviewer"
            RemotePipelineTests._write_jsonl(path, rows)
            payload = NerThresholdCalibrator().run(path, root / "thresholds.json")
            self.assertTrue(payload["human_approved"])
            self.assertEqual(payload["thresholds"], {"en": 0.3, "it": 0.3})


class FakeRewriter:
    def __init__(self) -> None:
        self.calls = 0

    @property
    def metadata(self) -> dict[str, str]:
        return {"implementation": "fake-rewriter", "model": "fake-frontier"}

    def rewrite(
        self, system_prompt: str, user_prompt: str, logit_bias=None, seed=None
    ) -> RewriteResponse:
        self.calls += 1
        return RewriteResponse(
            text="A fluent alter\u200bnative passage with stable factual content.",
            request_id=f"fake-{self.calls}",
            model="fake-frontier",
            provider="fake-provider",
            prompt_tokens=20,
            completion_tokens=8,
            cost_usd=0.001,
            latency_ms=10.0,
        )


class FakeDetector:
    @property
    def metadata(self) -> dict[str, str]:
        return {"implementation": "fake-detector"}

    def detect(self, algorithm: str, text: str) -> DetectionResult:
        return DetectionResult(
            "alternative" not in text, 0.2 if "alternative" in text else 0.9
        )


class FakeNeuralQuality:
    @property
    def metadata(self) -> dict[str, str]:
        return {"implementation": "fake-quality"}

    def evaluate_pairs(self, pairs: list[tuple[str, str]]) -> list[NeuralQualityResult]:
        return [NeuralQualityResult(0.95, 0.9, 0.9) for _ in pairs]


class FakeStructuredJudge:
    @property
    def metadata(self) -> dict[str, str]:
        return {"model": "fake-judge", "provider": "fake"}

    def complete_json(self, *args, **kwargs) -> StructuredResponse:
        return StructuredResponse(
            data={
                "meaning_preserved": True,
                "factual_consistency": True,
                "protected_facts_preserved": True,
                "fluency_score": 5,
                "naturalness_score": 4,
                "material_error": False,
                "reason_codes": ["none"],
                "evidence": "No material difference.",
            },
            request_id="judge-1",
            model="fake-judge",
            provider="fake",
            prompt_tokens=10,
            completion_tokens=10,
            reasoning_tokens=0,
            cost_usd=0.001,
            latency_ms=1.0,
            finish_reason="stop",
        )


class FakeEntityExtractor:
    @property
    def metadata(self) -> dict[str, str]:
        return {"implementation": "fake-entities"}

    def extract(self, text: str, language: str) -> list[EntitySpan]:
        result = []
        for value in ("Alice", "Bob"):
            if value in text:
                start = text.index(value)
                result.append(EntitySpan(value, start, start + len(value), "person", 1.0))
        return result


class RemotePipelineTests(unittest.TestCase):
    def _write_remote_fixtures(self, root: Path) -> tuple[Path, Path]:
        generations = []
        scores = []
        for language in ("en", "it"):
            calibration_id = f"{language}-cal"
            text = "plain calibration passage with enough distinct words"
            generations.append(
                {
                    "sample_id": calibration_id,
                    "language": language,
                    "domain": "test",
                    "split": "calibration",
                    "algorithm": "KGW",
                    "unwatermarked_text": text,
                    "watermarked_text": None,
                    "calibrated_threshold_1pct": 0.5,
                }
            )
            scores.append(
                self._score_row(f"{calibration_id}|baseline", calibration_id, text)
            )
            for index in range(4):
                sample_id = f"{language}-eval-{index}"
                original = (
                    "original watermark passage with several distinct factual words"
                )
                generations.append(
                    {
                        "sample_id": sample_id,
                        "language": language,
                        "domain": "test",
                        "split": "evaluation",
                        "algorithm": "KGW",
                        "unwatermarked_text": text,
                        "watermarked_text": original,
                        "unwatermarked_score": 0.1,
                        "watermarked_score": 0.9,
                        "calibrated_threshold_1pct": 0.5,
                        "calibrated_watermarked_detected": True,
                        "calibrated_unwatermarked_detected": False,
                    }
                )
                scores.append(
                    self._score_row(f"{sample_id}|KGW|watermarked", sample_id, original)
                )
        generations_path = root / "generations.jsonl"
        scores_path = root / "scores.jsonl"
        self._write_jsonl(generations_path, generations)
        self._write_jsonl(scores_path, scores)
        return generations_path, scores_path

    @staticmethod
    def _score_row(key: str, sample_id: str, text: str) -> dict:
        tokens = []
        cursor = 0
        for index, word in enumerate(text.split(), start=1):
            start = text.index(word, cursor)
            end = start + len(word)
            cursor = end
            tokens.append(
                asdict(TokenSurprisal(index, index, word, start, end, float(index)))
            )
        return {
            "score_key": key,
            "sample_id": sample_id,
            "token_count": len(tokens),
            "tokens": tokens,
        }

    @staticmethod
    def _write_jsonl(path: Path, rows: list[dict]) -> None:
        path.write_text(
            "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
        )

    def test_attack_evaluate_and_finalize_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            generations, scores = self._write_remote_fixtures(root)
            attacks = root / "attacks"
            attack_summary = AttackRunner(
                FakeRewriter(),
                FakeBiasTokenizer(),
                AttackConfig(beta_calibration_per_language=1, max_workers=4),
            ).run(generations, scores, attacks)
            self.assertEqual(attack_summary["evaluation_cases"], 8)
            self.assertEqual(attack_summary["candidate_count"], 96)
            self.assertEqual(attack_summary["baseline_count"], 32)
            self.assertEqual(attack_summary["evaluation_input_count"], 128)
            api_rows = [
                json.loads(line)
                for line in (attacks / "api-calls.jsonl").read_text().splitlines()
            ]
            self.assertEqual(
                len(api_rows), len({row["call_key"] for row in api_rows})
            )
            candidates = [
                json.loads(line)
                for line in (attacks / "candidates.jsonl").read_text().splitlines()
            ]
            self.assertEqual(
                {row["attack_split"] for row in candidates},
                {"development", "held_out_test"},
            )
            self.assertTrue(
                all("\u200b" not in row["candidate_text"] for row in candidates)
            )
            self.assertTrue(
                all(row["unicode_hygiene"]["changed"] for row in candidates)
            )

            evaluations = root / "evaluations.jsonl"
            evaluation_summary = CandidateEvaluationRunner(
                FakeDetector(), FakeNeuralQuality(), batch_size=7
            ).run(generations, attacks / "evaluation-inputs.jsonl", evaluations)
            self.assertEqual(evaluation_summary["candidates"], 128)
            self.assertEqual(
                evaluation_summary["artifact_breakdown"],
                {
                    "adaptive_oracle_attempt": 24,
                    "candidate_algorithm": 96,
                    "restamp_control": 8,
                },
            )

            report_dir = root / "report"
            summary = FinalReportRunner().run(
                attacks / "candidates.jsonl",
                evaluations,
                attacks / "api-calls.jsonl",
                report_dir,
                baselines_path=attacks / "baselines.jsonl",
            )
            self.assertEqual(
                summary["benchmark_scope"],
                "official_markllm_held_out_attack_evaluation",
            )
            self.assertTrue(summary["progressive_cells"])
            self.assertEqual(len(summary["surrogate"]["cells"]), 2)
            self.assertTrue(
                all(
                    cell["scope"] == "shared_across_candidate_pipelines"
                    for cell in summary["surrogate"]["cells"]
                )
            )
            self.assertTrue(summary["adaptive_oracle"]["cells"])
            self.assertTrue(summary["restamp_control"]["cells"])
            self.assertEqual(summary["adaptive_oracle"]["cells"][0]["mean_queries"], 1)
            self.assertTrue((report_dir / "REPORT.md").exists())
            self.assertTrue((report_dir / "human-review.csv").exists())
            self.assertTrue((report_dir / "adaptive-oracle-selections.jsonl").exists())

            judge_dir = root / "judge"
            judge_summary = LlmJudgeRunner(
                FakeStructuredJudge(), max_workers=4
            ).run(
                report_dir / "progressive-selections.jsonl",
                judge_dir,
            )
            self.assertEqual(judge_summary["judged_candidates"], 24)
            self.assertEqual(judge_summary["manual_audit_rows"], 24)
            self.assertTrue((judge_dir / "manual-audit.csv").exists())
            summary_with_judge = FinalReportRunner().run(
                attacks / "candidates.jsonl",
                evaluations,
                attacks / "api-calls.jsonl",
                report_dir,
                baselines_path=attacks / "baselines.jsonl",
                judge_evaluations_path=judge_dir / "llm-judge.jsonl",
            )
            self.assertEqual(
                summary_with_judge["llm_quality_prescreen"]["status"], "complete"
            )

    def test_modal_quality_recomputes_protected_spans(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = "Alice paid 42 euros."
            candidate = "Bob paid 41 euros."
            generations = root / "generations.jsonl"
            candidates = root / "candidates.jsonl"
            output = root / "evaluations.jsonl"
            self._write_jsonl(
                generations,
                [
                    {
                        "sample_id": "en-1",
                        "language": "en",
                        "split": "evaluation",
                        "algorithm": "KGW",
                        "unwatermarked_score": 0.1,
                        "watermarked_score": 0.9,
                        "calibrated_threshold_1pct": 0.5,
                        "calibrated_watermarked_detected": True,
                        "calibrated_unwatermarked_detected": False,
                    }
                ],
            )
            self._write_jsonl(
                candidates,
                [
                    {
                        "candidate_key": "en-1|KGW|test",
                        "case_key": "en-1|KGW",
                        "sample_id": "en-1",
                        "language": "en",
                        "algorithm": "KGW",
                        "pipeline": "test",
                        "budget": "test",
                        "artifact_kind": "candidate_algorithm",
                        "source_kind": "watermarked",
                        "attack_split": "held_out_test",
                        "original_text": original,
                        "candidate_text": candidate,
                        "deterministic_quality": {"passes": True},
                    }
                ],
            )
            record = ProtectedSpanRecord.build(
                original,
                "en",
                [EntitySpan("Alice", 0, 5, "person", 1.0)],
            )
            summary = CandidateEvaluationRunner(
                FakeDetector(),
                FakeNeuralQuality(),
                protected_spans=ProtectedSpanIndex([record], {"profile": "test"}),
                entity_extractor=FakeEntityExtractor(),
            ).run(generations, candidates, output)
            row = json.loads(output.read_text())
            self.assertFalse(row["deterministic_quality_pass"])
            self.assertIn("entities", row["deterministic_failure_reasons"])
            self.assertIn("introduced_entities", row["deterministic_failure_reasons"])
            self.assertEqual(summary["quality_profile"], "gliner-v1")

    def test_concurrent_restamp_call_is_shared_across_algorithms(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            generations_path, scores_path = self._write_remote_fixtures(root)
            generations = [
                json.loads(line) for line in generations_path.read_text().splitlines()
            ]
            scores = [json.loads(line) for line in scores_path.read_text().splitlines()]
            extra_generations = []
            extra_scores = []
            for row in generations:
                if row["split"] != "evaluation":
                    continue
                extra_generations.append({**row, "algorithm": "EXP"})
                original_key = f"{row['sample_id']}|KGW|watermarked"
                score = next(value for value in scores if value["score_key"] == original_key)
                extra_scores.append(
                    {
                        **score,
                        "score_key": f"{row['sample_id']}|EXP|watermarked",
                    }
                )
            self._write_jsonl(generations_path, [*generations, *extra_generations])
            self._write_jsonl(scores_path, [*scores, *extra_scores])
            output = root / "concurrent"
            AttackRunner(
                FakeRewriter(),
                FakeBiasTokenizer(),
                AttackConfig(
                    pipelines=("simple_paraphrase",),
                    algorithms=("KGW", "EXP"),
                    max_workers=4,
                    enable_oracle_baseline=False,
                ),
            ).run(generations_path, scores_path, output)
            calls = [
                json.loads(line)
                for line in (output / "api-calls.jsonl").read_text().splitlines()
            ]
            restamp = [row for row in calls if row["stage"] == "restamp_control"]
            self.assertEqual(len(restamp), 8)
            self.assertEqual(len(calls), 56)
            self.assertEqual(len(calls), len({row["call_key"] for row in calls}))


if __name__ == "__main__":
    unittest.main()
