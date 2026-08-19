from __future__ import annotations

import csv
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
            self.assertEqual(summary["benchmark_scope"], "controlled_decoupled_surrogates")
            self.assertIn(
                "bira_position_aware",
                summary["progressive_all_cells_by_pipeline"],
            )
            self.assertTrue((Path(directory) / "runs.csv").exists())
            payload = json.loads((Path(directory) / "summary.json").read_text())
            self.assertEqual(payload["source_passage_count"], 2)
            self.assertEqual(payload["composed_document_count"], 2)
            self.assertFalse(payload["candidate_set_protocol"]["shared_candidate_outputs"])
            with (Path(directory) / "runs.csv").open(newline="", encoding="utf-8") as handle:
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
                positions_by_case_budget.setdefault(key, set()).add(int(row["changed_positions"]))
            self.assertTrue(all(len(counts) == 1 for counts in positions_by_case_budget.values()))


if __name__ == "__main__":
    unittest.main()
