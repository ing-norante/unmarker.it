from __future__ import annotations

import csv
import json
import math
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from statistics import mean
from typing import Any

from .language_model import ReferenceNgramScorer
from .lexicon import VariantLexicon
from .metrics import measure_run
from .strategies import default_pipelines
from .tokenization import tokenize
from .types import RewriteCandidate, Sample
from .validators import QualityValidator
from .watermarks import SurrogateWatermark, default_surrogates


@dataclass(frozen=True)
class BenchmarkConfig:
    budgets: tuple[tuple[str, float], ...] = (
        ("conservative", 0.15),
        ("intermediate", 0.35),
        ("aggressive", 0.65),
    )
    fixed_budgets: dict[str, tuple[str, float]] = field(
        default_factory=lambda: {
            "simple_paraphrase": ("fixed", 0.65),
            "sira": ("paper_default", 0.70),
            "bira": ("paper_proxy", 0.50),
        }
    )
    cost_per_1k_tokens: dict[str, float] = field(default_factory=dict)
    calibration_null_keys: int = 128
    semantic_threshold: float = 0.90
    nli_threshold: float = 0.90
    compose_window: int = 4


class BenchmarkRunner:
    def __init__(self, samples: list[Sample], config: BenchmarkConfig | None = None) -> None:
        self.config = config or BenchmarkConfig()
        self.samples = self._compose_samples(samples, self.config.compose_window)
        self.lexicon = VariantLexicon.default()
        self.scorer = ReferenceNgramScorer(samples, self.lexicon)
        self.validator = QualityValidator(
            self.lexicon,
            self.config.semantic_threshold,
            self.config.nli_threshold,
        )
        self.detectors = default_surrogates(self.lexicon, self.scorer)
        self.pipelines = default_pipelines(self.lexicon, self.scorer)

    @staticmethod
    def _compose_samples(samples: list[Sample], window: int) -> list[Sample]:
        if window <= 1:
            return samples
        by_language: dict[str, list[Sample]] = defaultdict(list)
        for sample in samples:
            by_language[sample.language].append(sample)
        composed: list[Sample] = []
        for language, language_samples in sorted(by_language.items()):
            if len(language_samples) < window:
                composed.extend(language_samples)
                continue
            for start in range(len(language_samples)):
                selected = [
                    language_samples[(start + offset) % len(language_samples)]
                    for offset in range(window)
                ]
                composed.append(
                    Sample(
                        id="+".join(sample.id for sample in selected),
                        language=language,
                        text="\n\n".join(sample.text for sample in selected),
                    )
                )
        return composed

    @classmethod
    def from_jsonl(
        cls,
        dataset_path: Path,
        config: BenchmarkConfig | None = None,
        limit: int | None = None,
    ) -> "BenchmarkRunner":
        samples: list[Sample] = []
        with dataset_path.open(encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                payload = json.loads(line)
                samples.append(Sample(payload["id"], payload["language"], payload["text"]))
                if limit is not None and len(samples) >= limit:
                    break
        if not samples:
            raise ValueError(f"Dataset is empty: {dataset_path}")
        return cls(samples, config)

    def run(self, output_dir: Path) -> dict[str, Any]:
        output_dir.mkdir(parents=True, exist_ok=True)
        thresholds = {
            detector.name: detector.calibrate(self.samples, self.config.calibration_null_keys)
            for detector in self.detectors
        }
        records: list[dict[str, Any]] = []
        human_rows: list[dict[str, Any]] = []

        for sample in self.samples:
            for detector in self.detectors:
                watermarked_text = detector.embed(sample.text, sample.language)
                records.append(
                    self._record(
                        sample,
                        detector,
                        watermarked_text,
                        RewriteCandidate(watermarked_text, "no_attack", "none"),
                        latency_ms=0.0,
                        selected=True,
                        stop_passed=False,
                    )
                )

                for pipeline_name, (budget_name, budget_ratio) in self.config.fixed_budgets.items():
                    pipeline = self.pipelines[pipeline_name]
                    start = time.perf_counter()
                    candidate = pipeline.rewrite(
                        watermarked_text,
                        sample.language,
                        budget_name,
                        budget_ratio,
                    )
                    latency_ms = (time.perf_counter() - start) * 1000
                    record = self._record(
                        sample,
                        detector,
                        watermarked_text,
                        candidate,
                        latency_ms,
                        selected=True,
                        stop_passed=False,
                    )
                    records.append(record)
                    human_rows.append(self._human_row(sample, detector, watermarked_text, candidate, record))

                position_attempts = self._run_position_aware(sample, detector, watermarked_text)
                records.extend(position_attempts)
                selected = next(record for record in position_attempts if record["selected"])
                selected_candidate = RewriteCandidate(
                    selected["output_text"],
                    "bira_position_aware",
                    selected["budget"],
                )
                human_rows.append(
                    self._human_row(sample, detector, watermarked_text, selected_candidate, selected)
                )

        selected_records = [record for record in records if record["selected"]]
        summary = self._summarize(selected_records, thresholds)
        self._write_json(output_dir / "summary.json", summary)
        compact_records = [
            {key: value for key, value in record.items() if key not in {"input_text", "output_text"}}
            for record in records
        ]
        self._write_csv(output_dir / "runs.csv", compact_records)
        self._write_csv(output_dir / "human-review.csv", human_rows)
        self._write_json(output_dir / "config.json", asdict(self.config))
        return summary

    def _run_position_aware(
        self,
        sample: Sample,
        detector: SurrogateWatermark,
        watermarked_text: str,
    ) -> list[dict[str, Any]]:
        pipeline = self.pipelines["bira_position_aware"]
        attempts: list[dict[str, Any]] = []
        selected_index: int | None = None
        for budget_name, budget_ratio in self.config.budgets:
            start = time.perf_counter()
            candidate = pipeline.rewrite(
                watermarked_text,
                sample.language,
                budget_name,
                budget_ratio,
            )
            latency_ms = (time.perf_counter() - start) * 1000
            record = self._record(
                sample,
                detector,
                watermarked_text,
                candidate,
                latency_ms,
                selected=False,
                stop_passed=False,
            )
            attempts.append(record)
            if not record["detected"] and record["quality_passes"]:
                selected_index = len(attempts) - 1
                break
        if selected_index is None:
            selected_index = len(attempts) - 1
        attempts[selected_index]["selected"] = True
        attempts[selected_index]["stop_passed"] = (
            not attempts[selected_index]["detected"] and attempts[selected_index]["quality_passes"]
        )
        return attempts

    def _record(
        self,
        sample: Sample,
        detector: SurrogateWatermark,
        watermarked_text: str,
        candidate: RewriteCandidate,
        latency_ms: float,
        selected: bool,
        stop_passed: bool,
    ) -> dict[str, Any]:
        decision = detector.decide(candidate.text, sample.language)
        metrics = measure_run(
            watermarked_text,
            candidate.text,
            sample.language,
            self.validator,
            latency_ms,
            self.config.cost_per_1k_tokens.get(candidate.pipeline, 0.0),
        )
        return {
            "sample_id": sample.id,
            "language": sample.language,
            "watermark": detector.name,
            "pipeline": candidate.pipeline,
            "budget": candidate.budget,
            "selected": selected,
            "stop_passed": stop_passed,
            "score": decision.score,
            "threshold": decision.threshold,
            "detected": decision.detected,
            "token_edit_distance": metrics.token_edit_distance,
            "changed_token_ratio": metrics.changed_token_ratio,
            "character_edit_distance": metrics.character_edit_distance,
            "semantic_similarity": metrics.quality.semantic_similarity,
            "nli_proxy": metrics.quality.nli_proxy,
            "protected_preservation": metrics.quality.protected_preservation,
            "negation_preservation": metrics.quality.negation_preservation,
            "entities_preserved": metrics.quality.entities_preserved,
            "numbers_preserved": metrics.quality.numbers_preserved,
            "urls_preserved": metrics.quality.urls_preserved,
            "quality_passes": metrics.quality.passes,
            "latency_ms": metrics.latency_ms,
            "estimated_cost_per_1k_tokens": metrics.estimated_cost_per_1k_tokens,
            "input_tokens": len(tokenize(watermarked_text)),
            "changed_positions": len(candidate.changed_positions),
            "input_text": watermarked_text,
            "output_text": candidate.text,
        }

    @staticmethod
    def _human_row(
        sample: Sample,
        detector: SurrogateWatermark,
        watermarked_text: str,
        candidate: RewriteCandidate,
        record: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "sample_id": sample.id,
            "language": sample.language,
            "watermark": detector.name,
            "pipeline": candidate.pipeline,
            "budget": candidate.budget,
            "original": watermarked_text,
            "candidate": candidate.text,
            "automatic_semantic_similarity": record["semantic_similarity"],
            "human_faithfulness_1_5": "",
            "human_fluency_1_5": "",
            "human_style_preservation_1_5": "",
            "human_notes": "",
        }

    def _summarize(
        self,
        records: list[dict[str, Any]],
        thresholds: dict[str, dict[str, float]],
    ) -> dict[str, Any]:
        grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
        overall: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for record in records:
            grouped[(record["language"], record["watermark"], record["pipeline"])].append(record)
            overall[record["pipeline"]].append(record)

        baseline_detected = {
            (record["sample_id"], record["language"], record["watermark"]): record["detected"]
            for record in records
            if record["pipeline"] == "no_attack"
        }

        def aggregate(items: list[dict[str, Any]]) -> dict[str, Any]:
            initially_detected = [
                item
                for item in items
                if baseline_detected.get((item["sample_id"], item["language"], item["watermark"]), False)
            ]
            conditional_evasion = (
                mean(float(not item["detected"]) for item in initially_detected)
                if initially_detected and items[0]["pipeline"] != "no_attack"
                else 0.0
            )
            return {
                "samples": len(items),
                "initially_detected_samples": len(initially_detected),
                "tpr_at_fpr_1pct": mean(float(item["detected"]) for item in items),
                "conditional_evasion_rate": conditional_evasion,
                "mean_changed_token_ratio": mean(item["changed_token_ratio"] for item in items),
                "mean_token_edit_distance": mean(item["token_edit_distance"] for item in items),
                "mean_semantic_similarity": mean(item["semantic_similarity"] for item in items),
                "mean_nli_proxy": mean(item["nli_proxy"] for item in items),
                "protected_preservation_rate": mean(item["protected_preservation"] for item in items),
                "quality_pass_rate": mean(float(item["quality_passes"]) for item in items),
                "progressive_stop_pass_rate": mean(float(item["stop_passed"]) for item in items),
                "mean_latency_ms": mean(item["latency_ms"] for item in items),
                "mean_estimated_cost_per_1k_tokens": mean(
                    item["estimated_cost_per_1k_tokens"] for item in items
                ),
            }

        return {
            "benchmark_scope": "controlled_reference_surrogates",
            "warning": (
                "These results validate benchmark mechanics against deterministic KGW, Unigram, "
                "and SynthID-tournament-like surrogates. They do not demonstrate removal of Claude's production watermark."
            ),
            "fpr_target": 0.01,
            "thresholds": thresholds,
            "sample_count": len(self.samples),
            "languages": sorted({sample.language for sample in self.samples}),
            "overall_by_pipeline": {
                pipeline: aggregate(items) for pipeline, items in sorted(overall.items())
            },
            "by_language_watermark_pipeline": [
                {
                    "language": language,
                    "watermark": watermark,
                    "pipeline": pipeline,
                    **aggregate(items),
                }
                for (language, watermark, pipeline), items in sorted(grouped.items())
            ],
        }

    @staticmethod
    def _write_json(path: Path, payload: Any) -> None:
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    @staticmethod
    def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
        if not rows:
            path.write_text("", encoding="utf-8")
            return
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)


def compact_summary(summary: dict[str, Any]) -> str:
    lines = [
        "pipeline                 TPR@1%FPR  evasion   changed   semantic  quality  progressive",
        "-----------------------  ---------  --------  --------  --------  -------  -----------",
    ]
    for pipeline, metrics in summary["overall_by_pipeline"].items():
        lines.append(
            f"{pipeline:<23}  {metrics['tpr_at_fpr_1pct']:<9.3f}  "
            f"{metrics['conditional_evasion_rate']:<8.3f}  "
            f"{metrics['mean_changed_token_ratio']:<8.3f}  "
            f"{metrics['mean_semantic_similarity']:<8.3f}  "
            f"{metrics['quality_pass_rate']:<7.3f}  "
            f"{metrics['progressive_stop_pass_rate']:<11.3f}"
        )
    return "\n".join(lines)
