from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from unmarker_text_bench.language_model import ReferenceNgramScorer
from unmarker_text_bench.lexicon import VariantLexicon
from unmarker_text_bench.runner import BenchmarkConfig, BenchmarkRunner
from unmarker_text_bench.strategies import PositionAwareBiraPipeline
from unmarker_text_bench.tokenization import extract_numbers, extract_urls, replace_tokens, tokenize
from unmarker_text_bench.types import Sample
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


class PipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.lexicon = VariantLexicon.default()
        self.scorer = ReferenceNgramScorer(SAMPLES, self.lexicon)

    def test_position_aware_preserves_protected_content(self) -> None:
        pipeline = PositionAwareBiraPipeline(self.lexicon, self.scorer)
        candidate = pipeline.rewrite(SAMPLES[0].text, "en", "aggressive", 0.5)
        report = QualityValidator(self.lexicon).evaluate(SAMPLES[0].text, candidate.text, "en")
        self.assertTrue(report.entities_preserved)
        self.assertTrue(report.numbers_preserved)
        self.assertTrue(report.urls_preserved)
        self.assertEqual(report.negation_preservation, 1.0)

    def test_surrogate_watermark_strengthens_detector_score(self) -> None:
        detector = KgwSurrogate("test-key", self.lexicon, self.scorer)
        detector.calibrate(SAMPLES, null_keys=64)
        watermarked = [detector.embed(sample.text, sample.language) for sample in SAMPLES]
        clean_scores = [detector.score(sample.text, sample.language) for sample in SAMPLES]
        marked_scores = [detector.score(text, sample.language) for text, sample in zip(watermarked, SAMPLES)]
        self.assertGreater(sum(marked_scores), sum(clean_scores))


class RunnerTests(unittest.TestCase):
    def test_runner_writes_expected_artifacts(self) -> None:
        runner = BenchmarkRunner(SAMPLES, BenchmarkConfig(calibration_null_keys=16))
        with tempfile.TemporaryDirectory() as directory:
            summary = runner.run(Path(directory))
            self.assertEqual(summary["benchmark_scope"], "controlled_reference_surrogates")
            self.assertIn("bira_position_aware", summary["overall_by_pipeline"])
            self.assertTrue((Path(directory) / "runs.csv").exists())
            payload = json.loads((Path(directory) / "summary.json").read_text())
            self.assertEqual(payload["sample_count"], 2)


if __name__ == "__main__":
    unittest.main()
