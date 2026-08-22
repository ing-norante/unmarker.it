from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from .protected_spans import (
    GLINER_LABELS,
    THRESHOLD_GRID,
    EntityExtractor,
    EntitySpan,
    text_sha256,
)

PUBLIC_GOLD_LABELS = ("person", "organization", "location")
UNER_ENGLISH_COMMIT = "8ed072de2fd24022cc62458997fe96a8fe191ea4"
UNER_ENGLISH_URL = (
    "https://raw.githubusercontent.com/UniversalNER/UNER_English-EWT/"
    f"{UNER_ENGLISH_COMMIT}/en_ewt-ud-test.iob2"
)
UNER_ENGLISH_SHA256 = "821ad826d5f503ac03b4edc3fbc2174f21fbb005ec25863caf2051c434616d6e"
KIND_ITALIAN_COMMIT = "a2ad139171ef7fde0dff0f8ea94d18356340ada9"
KIND_ITALIAN_URL = (
    "https://raw.githubusercontent.com/dhfbk/KIND/"
    f"{KIND_ITALIAN_COMMIT}/dataset/wikinews_test.tsv"
)
KIND_ITALIAN_SHA256 = "a99a236f51832b6698f5d98eb15b3041f2615bdb689c0770e4e2aa752b1a53c7"
_LABEL_MAP = {"PER": "person", "ORG": "organization", "LOC": "location"}


class PublicNerGoldSourceBuilder:
    """Build a deterministic bilingual PER/ORG/LOC gold set from human NER data."""

    ARTIFACT_SCHEMA_VERSION = 3

    def __init__(self, samples_per_language: int = 50) -> None:
        if samples_per_language < 1:
            raise ValueError("samples_per_language must be positive")
        self.samples_per_language = samples_per_language

    def download_and_run(self, output_path: Path) -> dict[str, Any]:
        english = self._download(UNER_ENGLISH_URL, UNER_ENGLISH_SHA256)
        italian = self._download(KIND_ITALIAN_URL, KIND_ITALIAN_SHA256)
        return self.run(english.decode(), italian.decode(), output_path)

    def run(
        self,
        english_iob2: str,
        italian_tsv: str,
        output_path: Path,
    ) -> dict[str, Any]:
        english = self._select_english(_parse_uner_english(english_iob2))
        italian = self._select_rows(_parse_kind_italian(italian_tsv), "it")
        rows = [*english, *italian]
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _write_jsonl(output_path, rows)
        manifest = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "status": "published_human_gold",
            "human_approved": True,
            "source_kind": "public_human_annotated_gold",
            "labels": list(PUBLIC_GOLD_LABELS),
            "samples_per_language": self.samples_per_language,
            "rows": len(rows),
            "selection": (
                "deterministic blake2b sampling; English uses at most one sentence "
                "per source document"
            ),
            "sources": _public_source_provenance(),
            "output_sha256": hashlib.sha256(output_path.read_bytes()).hexdigest(),
            "research_only": True,
            "license_note": (
                "KIND annotations are CC BY-NC 4.0, so this combined calibration "
                "artifact is restricted to non-commercial research use."
            ),
        }
        _write_json(output_path.with_suffix(".manifest.json"), manifest)
        return manifest

    @staticmethod
    def _download(url: str, expected_sha256: str) -> bytes:
        with urllib.request.urlopen(url, timeout=60) as response:
            payload = response.read()
        actual = hashlib.sha256(payload).hexdigest()
        if actual != expected_sha256:
            raise ValueError(
                f"Public NER source hash mismatch for {url}: expected "
                f"{expected_sha256}, got {actual}"
            )
        return payload

    def _select_english(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        by_document: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            by_document[str(row["document_id"])].append(row)
        representatives = [
            min(
                document_rows,
                key=lambda row: _sample_order(f"en-sentence|{row['source_id']}"),
            )
            for document_rows in by_document.values()
        ]
        return self._select_rows(representatives, "en")

    def _select_rows(
        self, rows: list[dict[str, Any]], language: str
    ) -> list[dict[str, Any]]:
        ordered = sorted(
            rows,
            key=lambda row: _sample_order(
                f"public-ner-gold-v1|{language}|{row['source_id']}"
            ),
        )
        if len(ordered) < self.samples_per_language:
            raise ValueError(
                f"Need {self.samples_per_language} public gold rows for {language}; "
                f"found {len(ordered)}"
            )
        return [
            self._gold_row(row, language)
            for row in ordered[: self.samples_per_language]
        ]

    def _gold_row(self, row: dict[str, Any], language: str) -> dict[str, Any]:
        source = "UNER English-EWT" if language == "en" else "KIND Wikinews"
        return {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "sample_id": f"public-gold-{language}-{row['source_id']}",
            "language": language,
            "text": row["text"],
            "text_sha256": text_sha256(row["text"]),
            "model_suggestions": [],
            "human_entities": row["entities"],
            "gold_label_set": list(PUBLIC_GOLD_LABELS),
            "review_status": "approved",
            "reviewer": f"published human annotators: {source}",
            "review_notes": "Imported without relabeling from a pinned published gold file.",
            "gold_provenance": next(
                item for item in _public_source_provenance() if item["name"] == source
            ),
        }


class NerGoldDraftRunner:
    ARTIFACT_SCHEMA_VERSION = 3

    def __init__(
        self, extractor: EntityExtractor, samples_per_language: int = 50
    ) -> None:
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
                            _span_dict(span)
                            for span in self.extractor.extract(text, language)
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
        source_is_approved = bool(source_rows) and all(
            row.get("review_status") == "approved"
            and str(row.get("reviewer", "")).strip()
            and "human_entities" in row
            for row in source_rows
        )
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
                sample_id = row.get("sample_id", row.get("id"))
                if not sample_id:
                    raise ValueError("Every NER gold source row needs id or sample_id")
                selected.append(
                    {
                        "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
                        "sample_id": str(sample_id),
                        "language": language,
                        "text": text,
                        "text_sha256": text_sha256(text),
                        "model_suggestions": [
                            _span_dict(span)
                            for span in self.extractor.extract(text, language)
                        ],
                        "human_entities": row.get("human_entities", [])
                        if source_is_approved
                        else [],
                        "gold_label_set": row.get("gold_label_set"),
                        "review_status": "approved"
                        if source_is_approved
                        else "pending",
                        "reviewer": str(row.get("reviewer", ""))
                        if source_is_approved
                        else "",
                        "review_notes": str(row.get("review_notes", "")),
                        "gold_provenance": row.get("gold_provenance"),
                    }
                )
        identifiers = [row["sample_id"] for row in selected]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("Private NER source ids must be unique")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _write_jsonl(output_path, selected)
        manifest = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "status": "published_human_gold"
            if source_is_approved
            else "pending_human_review",
            "human_approved": source_is_approved,
            "source_kind": (
                "public_human_annotated_gold"
                if source_is_approved
                else "external_private_gold_source"
            ),
            "samples_per_language": self.samples_per_language,
            "rows": len(selected),
            "source_sha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
            "extractor": self.extractor.metadata,
            "gold_provenance": sorted(
                {
                    json.dumps(row["gold_provenance"], sort_keys=True)
                    for row in selected
                    if row.get("gold_provenance")
                }
            ),
            "instructions": (
                "Published gold labels are ready for threshold calibration."
                if source_is_approved
                else "Review every span, populate human_entities, set "
                "review_status=approved, and identify the reviewer. Model "
                "suggestions are not gold labels."
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
        label_sets = {tuple(row.get("gold_label_set") or GLINER_LABELS) for row in rows}
        if len(label_sets) != 1:
            raise ValueError("Every gold row must use the same entity label set")
        labels = next(iter(label_sets))
        if not labels or len(labels) != len(set(labels)):
            raise ValueError("The gold entity label set must be non-empty and unique")
        invalid = []
        for row in rows:
            if (
                row.get("review_status") != "approved"
                or not str(row.get("reviewer", "")).strip()
            ):
                invalid.append(str(row.get("sample_id", "unknown")))
            if text_sha256(str(row["text"])) != row.get("text_sha256"):
                raise ValueError(f"Text hash mismatch for {row.get('sample_id')}")
            self._validate_human_spans(row, set(labels))
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
                        and str(span["label"]) in labels
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
            "labels": list(labels),
            "metrics": dict(metrics),
            "reviewed_rows": len(rows),
            "reviewed_rows_by_language": {
                language: sum(row["language"] == language for row in rows)
                for language in ("en", "it")
            },
            "reviewers": sorted({str(row["reviewer"]).strip() for row in rows}),
            "gold_provenance": sorted(
                {
                    json.dumps(row["gold_provenance"], sort_keys=True)
                    for row in rows
                    if row.get("gold_provenance")
                }
            ),
            "reviewed_gold_sha256": hashlib.sha256(
                reviewed_path.read_bytes()
            ).hexdigest(),
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _write_json(output_path, payload)
        return payload

    @staticmethod
    def _validate_human_spans(row: dict[str, Any], labels: set[str]) -> None:
        text = str(row["text"])
        for span in row.get("human_entities", []):
            start = int(span["start"])
            end = int(span["end"])
            if start < 0 or end <= start or end > len(text):
                raise ValueError(f"Invalid human span offsets for {row['sample_id']}")
            if text[start:end] != span["text"]:
                raise ValueError(f"Human span text mismatch for {row['sample_id']}")
            if str(span["label"]) not in labels:
                raise ValueError(f"Human span label mismatch for {row['sample_id']}")


def _span_key(span: dict[str, Any]) -> tuple[int, int, str]:
    return int(span["start"]), int(span["end"]), str(span["label"])


def _public_source_provenance() -> list[dict[str, Any]]:
    return [
        {
            "name": "UNER English-EWT",
            "language": "en",
            "annotation": "human gold",
            "license": "CC BY-SA 4.0",
            "repository": "https://github.com/UniversalNER/UNER_English-EWT",
            "commit": UNER_ENGLISH_COMMIT,
            "file": "en_ewt-ud-test.iob2",
            "sha256": UNER_ENGLISH_SHA256,
            "citation": "Mayhew et al., NAACL 2024",
        },
        {
            "name": "KIND Wikinews",
            "language": "it",
            "annotation": "manual gold",
            "license": "CC BY-NC 4.0",
            "repository": "https://github.com/dhfbk/KIND",
            "commit": KIND_ITALIAN_COMMIT,
            "file": "dataset/wikinews_test.tsv",
            "sha256": KIND_ITALIAN_SHA256,
            "citation": "Paccosi and Palmero Aprosio, LREC 2022",
        },
    ]


def _sample_order(value: str) -> bytes:
    return hashlib.blake2b(value.encode(), digest_size=16).digest()


def _parse_uner_english(payload: str) -> list[dict[str, Any]]:
    rows = []
    document_id = ""
    for block in re.split(r"\n\s*\n", payload.strip()):
        lines = block.splitlines()
        metadata = {}
        tokens = []
        tags = []
        for line in lines:
            if line.startswith("# ") and " = " in line:
                key, value = line[2:].split(" = ", 1)
                metadata[key] = value
            elif line and not line.startswith("#"):
                columns = line.split("\t")
                if len(columns) < 3:
                    raise ValueError("Invalid UNER English IOB2 row")
                tokens.append(columns[1])
                tags.append(columns[2])
        document_id = metadata.get("newdoc id", document_id)
        text = metadata.get("text", "")
        source_id = metadata.get("sent_id", "")
        if not document_id or not source_id or not text or not tokens:
            raise ValueError("Incomplete UNER English sentence metadata")
        offsets = _align_tokens(text, tokens)
        rows.append(
            {
                "document_id": document_id,
                "source_id": source_id,
                "text": text,
                "entities": _bio_entities(text, tokens, tags, offsets),
            }
        )
    return rows


def _parse_kind_italian(payload: str) -> list[dict[str, Any]]:
    rows = []
    for index, block in enumerate(re.split(r"\n\s*\n", payload.strip()), start=1):
        tokens = []
        tags = []
        for line in block.splitlines():
            if not line.strip():
                continue
            columns = line.split("\t")
            if len(columns) != 2:
                raise ValueError("Invalid KIND Italian TSV row")
            tokens.append(columns[0])
            tags.append(columns[1])
        if not tokens:
            continue
        text, offsets = _detokenize_italian(tokens)
        bio_tags = []
        previous = "O"
        for tag in tags:
            if tag == "O":
                bio_tags.append(tag)
            else:
                prefix = "I" if tag == previous else "B"
                bio_tags.append(f"{prefix}-{tag}")
            previous = tag
        rows.append(
            {
                "source_id": f"wikinews-test-sentence-{index:05d}",
                "text": text,
                "entities": _bio_entities(text, tokens, bio_tags, offsets),
            }
        )
    return rows


def _align_tokens(text: str, tokens: list[str]) -> list[tuple[int, int]]:
    offsets = []
    cursor = 0
    for token in tokens:
        start = text.find(token, cursor)
        if start < 0:
            raise ValueError(f"Cannot align token {token!r} in published gold text")
        end = start + len(token)
        offsets.append((start, end))
        cursor = end
    return offsets


def _detokenize_italian(tokens: list[str]) -> tuple[str, list[tuple[int, int]]]:
    text = ""
    offsets = []
    no_space_before = re.compile(r"^[,.;:!?%\)\]\}]+$")
    no_space_after = re.compile(r"^[\(\[\{]+$")
    previous = ""
    for token in tokens:
        separator = ""
        if text and not (
            no_space_before.fullmatch(token)
            or no_space_after.fullmatch(previous)
            or previous.endswith(("'", "’"))
        ):
            separator = " "
        text += separator
        start = len(text)
        text += token
        offsets.append((start, len(text)))
        previous = token
    return text, offsets


def _bio_entities(
    text: str,
    tokens: list[str],
    tags: list[str],
    offsets: list[tuple[int, int]],
) -> list[dict[str, Any]]:
    entities = []
    current_start = current_end = None
    current_label = ""

    def flush() -> None:
        nonlocal current_start, current_end, current_label
        if current_start is not None and current_end is not None:
            entities.append(
                {
                    "text": text[current_start:current_end],
                    "start": current_start,
                    "end": current_end,
                    "label": _LABEL_MAP[current_label],
                }
            )
        current_start = current_end = None
        current_label = ""

    for token, tag, (start, end) in zip(tokens, tags, offsets, strict=True):
        del token
        if tag == "O":
            flush()
            continue
        match = re.fullmatch(r"([BI])-(PER|ORG|LOC)", tag)
        if not match:
            raise ValueError(f"Unsupported public gold entity tag: {tag}")
        prefix, label = match.groups()
        if prefix == "B" or label != current_label:
            flush()
            current_start = start
        current_end = end
        current_label = label
    flush()
    return entities


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
