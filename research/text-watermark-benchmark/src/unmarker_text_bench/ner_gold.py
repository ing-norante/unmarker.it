from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from .protected_spans import THRESHOLD_GRID, EntityExtractor, EntitySpan, text_sha256


class NerGoldDraftRunner:
    ARTIFACT_SCHEMA_VERSION = 3

    def __init__(self, extractor: EntityExtractor, samples_per_language: int = 50) -> None:
        if samples_per_language < 1:
            raise ValueError("samples_per_language must be positive")
        self.extractor = extractor
        self.samples_per_language = samples_per_language

    def run(self, generations_path: Path, output_path: Path) -> dict[str, Any]:
        generations = _read_jsonl(generations_path)
        unique: dict[tuple[str, str], dict[str, Any]] = {}
        for row in generations:
            if row.get("split") != "calibration" or not row.get("unwatermarked_text"):
                continue
            key = (str(row["language"]), str(row["sample_id"]))
            unique.setdefault(key, row)
        selected = []
        for language in ("en", "it"):
            language_rows = sorted(
                (row for (lang, _), row in unique.items() if lang == language),
                key=lambda row: hashlib.blake2b(
                    f"ner-gold-v1|{row['sample_id']}".encode(), digest_size=8
                ).digest(),
            )
            if len(language_rows) < self.samples_per_language:
                raise ValueError(
                    f"Need {self.samples_per_language} calibration texts for {language}; "
                    f"found {len(language_rows)}"
                )
            for row in language_rows[: self.samples_per_language]:
                text = str(row["unwatermarked_text"])
                selected.append(
                    {
                        "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
                        "sample_id": row["sample_id"],
                        "language": language,
                        "text": text,
                        "text_sha256": text_sha256(text),
                        "model_suggestions": [
                            _span_dict(span) for span in self.extractor.extract(text, language)
                        ],
                        "human_entities": [],
                        "review_status": "pending",
                        "reviewer": "",
                        "review_notes": "",
                    }
                )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _write_jsonl(output_path, selected)
        manifest = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "status": "pending_human_review",
            "human_approved": False,
            "samples_per_language": self.samples_per_language,
            "rows": len(selected),
            "source_generations_sha256": hashlib.sha256(
                generations_path.read_bytes()
            ).hexdigest(),
            "extractor": self.extractor.metadata,
            "instructions": (
                "Review every span, populate human_entities, set review_status=approved, "
                "and identify the reviewer. Model suggestions are not gold labels."
            ),
        }
        _write_json(output_path.with_suffix(".manifest.json"), manifest)
        return manifest

    def run_source(self, source_path: Path, output_path: Path) -> dict[str, Any]:
        source_rows = _read_jsonl(source_path)
        selected = []
        for language in ("en", "it"):
            language_rows = [
                row for row in source_rows if str(row.get("language")) == language
            ]
            if len(language_rows) != self.samples_per_language:
                raise ValueError(
                    f"Private NER source must contain exactly {self.samples_per_language} "
                    f"rows for {language}; found {len(language_rows)}"
                )
            for row in language_rows:
                text = str(row["text"])
                selected.append(
                    {
                        "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
                        "sample_id": str(row["id"]),
                        "language": language,
                        "text": text,
                        "text_sha256": text_sha256(text),
                        "model_suggestions": [
                            _span_dict(span) for span in self.extractor.extract(text, language)
                        ],
                        "human_entities": [],
                        "review_status": "pending",
                        "reviewer": "",
                        "review_notes": "",
                    }
                )
        identifiers = [row["sample_id"] for row in selected]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("Private NER source ids must be unique")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _write_jsonl(output_path, selected)
        manifest = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "status": "pending_human_review",
            "human_approved": False,
            "source_kind": "external_private_gold_source",
            "samples_per_language": self.samples_per_language,
            "rows": len(selected),
            "source_sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
            "extractor": self.extractor.metadata,
            "instructions": (
                "Review every span, populate human_entities, set review_status=approved, "
                "and identify the reviewer. Model suggestions are not gold labels."
            ),
        }
        _write_json(output_path.with_suffix(".manifest.json"), manifest)
        return manifest


class NerThresholdCalibrator:
    ARTIFACT_SCHEMA_VERSION = 3

    def run(self, reviewed_path: Path, output_path: Path) -> dict[str, Any]:
        rows = _read_jsonl(reviewed_path)
        if not rows:
            raise ValueError("The reviewed NER gold set is empty")
        languages = {str(row.get("language")) for row in rows}
        if languages != {"en", "it"}:
            raise ValueError("The reviewed NER gold set must contain en and it")
        invalid = []
        for row in rows:
            if row.get("review_status") != "approved" or not str(
                row.get("reviewer", "")
            ).strip():
                invalid.append(str(row.get("sample_id", "unknown")))
            if text_sha256(str(row["text"])) != row.get("text_sha256"):
                raise ValueError(f"Text hash mismatch for {row.get('sample_id')}")
            self._validate_human_spans(row)
        if invalid:
            raise ValueError(
                "Every gold row must be explicitly approved by a named reviewer; "
                f"pending rows: {invalid[:10]}"
            )

        metrics: dict[str, list[dict[str, Any]]] = defaultdict(list)
        thresholds: dict[str, float] = {}
        for language in ("en", "it"):
            language_rows = [row for row in rows if row["language"] == language]
            for threshold in THRESHOLD_GRID:
                tp = fp = fn = 0
                for row in language_rows:
                    expected = {_span_key(span) for span in row["human_entities"]}
                    predicted = {
                        _span_key(span)
                        for span in row.get("model_suggestions", [])
                        if float(span["score"]) >= threshold
                    }
                    tp += len(expected & predicted)
                    fp += len(predicted - expected)
                    fn += len(expected - predicted)
                precision = tp / (tp + fp) if tp + fp else 0.0
                recall = tp / (tp + fn) if tp + fn else 0.0
                f1 = (
                    2 * precision * recall / (precision + recall)
                    if precision + recall
                    else 0.0
                )
                metrics[language].append(
                    {
                        "threshold": threshold,
                        "precision": precision,
                        "recall": recall,
                        "f1": f1,
                        "tp": tp,
                        "fp": fp,
                        "fn": fn,
                    }
                )
            best = max(
                metrics[language],
                key=lambda row: (row["f1"], row["recall"], -row["threshold"]),
            )
            thresholds[language] = float(best["threshold"])

        payload = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "status": "human_approved",
            "human_approved": True,
            "selection_rule": "maximize exact-span F1; break ties by recall then lower threshold",
            "thresholds": thresholds,
            "metrics": dict(metrics),
            "reviewed_rows": len(rows),
            "reviewers": sorted({str(row["reviewer"]).strip() for row in rows}),
            "reviewed_gold_sha256": hashlib.sha256(reviewed_path.read_bytes()).hexdigest(),
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _write_json(output_path, payload)
        return payload

    @staticmethod
    def _validate_human_spans(row: dict[str, Any]) -> None:
        text = str(row["text"])
        for span in row.get("human_entities", []):
            start = int(span["start"])
            end = int(span["end"])
            if start < 0 or end <= start or end > len(text):
                raise ValueError(f"Invalid human span offsets for {row['sample_id']}")
            if text[start:end] != span["text"]:
                raise ValueError(f"Human span text mismatch for {row['sample_id']}")


def _span_key(span: dict[str, Any]) -> tuple[int, int, str]:
    return int(span["start"]), int(span["end"]), str(span["label"])


def _span_dict(span: EntitySpan) -> dict[str, Any]:
    return {
        "text": span.text,
        "start": span.start,
        "end": span.end,
        "label": span.label,
        "score": span.score,
    }


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
