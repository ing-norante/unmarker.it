from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Protocol

from .tokenization import extract_negations, extract_numbers, extract_urls

GLINER_MODEL = "urchade/gliner_multi-v2.1"
GLINER_MODEL_REVISION = "443d26d654e0324125a96bebd8e796c14ff2efe6"
GLINER_VERSION = "0.2.24"
GLINER_LABELS = (
    "person",
    "organization",
    "location",
    "product",
    "event",
    "work of art",
    "legal document",
)
THRESHOLD_GRID = tuple(round(value / 100, 2) for value in range(30, 96, 5))
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
QUOTED_RE = re.compile(r'(?:(?:"([^"]+)")|(?:“([^”]+)”)|(?:‘([^’]+)’))')


def text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _normalized_surface(text: str) -> str:
    return unicodedata.normalize("NFC", text)


@dataclass(frozen=True)
class EntitySpan:
    text: str
    start: int
    end: int
    label: str
    score: float

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> EntitySpan:
        return cls(
            text=str(payload["text"]),
            start=int(payload["start"]),
            end=int(payload["end"]),
            label=str(payload["label"]),
            score=float(payload["score"]),
        )


class EntityExtractor(Protocol):
    @property
    def metadata(self) -> dict[str, Any]: ...

    def extract(self, text: str, language: str) -> list[EntitySpan]: ...


def extract_structured(text: str, language: str) -> dict[str, list[str]]:
    quotations = []
    for match in QUOTED_RE.finditer(text):
        quotations.append(next(value for value in match.groups() if value is not None))
    return {
        "numbers": list(extract_numbers(text)),
        "urls": list(extract_urls(text)),
        "emails": EMAIL_RE.findall(text),
        "quotations": quotations,
        "negations": list(extract_negations(text, language)),
    }


@dataclass(frozen=True)
class ProtectedSpanRecord:
    text_sha256: str
    language: str
    text_length: int
    entities: tuple[EntitySpan, ...]
    structured: dict[str, list[str]]

    @classmethod
    def build(
        cls,
        text: str,
        language: str,
        entities: Iterable[EntitySpan],
    ) -> ProtectedSpanRecord:
        return cls(
            text_sha256=text_sha256(text),
            language=language,
            text_length=len(text),
            entities=tuple(entities),
            structured=extract_structured(text, language),
        )

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> ProtectedSpanRecord:
        return cls(
            text_sha256=str(payload["text_sha256"]),
            language=str(payload["language"]),
            text_length=int(payload["text_length"]),
            entities=tuple(
                EntitySpan.from_dict(value) for value in payload.get("entities", [])
            ),
            structured={
                str(key): [str(value) for value in values]
                for key, values in payload.get("structured", {}).items()
            },
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ProtectedSpanIndex:
    def __init__(
        self,
        records: Iterable[ProtectedSpanRecord],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        materialized = tuple(records)
        self.records = {
            (record.text_sha256, record.language): record for record in materialized
        }
        if len(self.records) != len(materialized):
            raise ValueError(
                "Protected-span records contain duplicate text/language keys"
            )
        self.metadata = metadata or {}

    @classmethod
    def load(
        cls, records_path: Path, manifest_path: Path | None = None
    ) -> ProtectedSpanIndex:
        records = []
        with records_path.open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    records.append(ProtectedSpanRecord.from_dict(json.loads(line)))
                except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
                    raise ValueError(
                        f"Invalid protected-span record at {records_path}:{line_number}"
                    ) from error
        if not records:
            raise ValueError(f"Protected-span manifest is empty: {records_path}")
        resolved_manifest = manifest_path or records_path.with_suffix(".manifest.json")
        metadata = (
            json.loads(resolved_manifest.read_text(encoding="utf-8"))
            if resolved_manifest.exists()
            else {}
        )
        metadata = {
            **metadata,
            "records_sha256": hashlib.sha256(records_path.read_bytes()).hexdigest(),
        }
        return cls(records, metadata)

    def get(self, text: str, language: str) -> ProtectedSpanRecord:
        digest = text_sha256(text)
        try:
            record = self.records[(digest, language)]
        except KeyError as error:
            raise ValueError(
                f"No protected-span record for text sha256={digest}, language={language}"
            ) from error
        return record


def protected_prompt_fragment(record: ProtectedSpanRecord) -> str:
    protected: dict[str, list[str]] = {
        "entities": [span.text for span in record.entities],
        **record.structured,
    }
    nonempty = {key: values for key, values in protected.items() if values}
    if not nonempty:
        return "There are no extracted protected spans. Preserve all facts and polarity anyway."
    lines = [
        "The following values must remain verbatim and with the same multiplicity:"
    ]
    for field, values in nonempty.items():
        lines.append(f"- {field}: {values!r}")
    return "\n".join(lines)


def _surface_count(text: str, surface: str) -> int:
    value = _normalized_surface(text)
    expected = _normalized_surface(surface)
    prefix = r"(?<!\w)" if expected[:1].isalnum() else ""
    suffix = r"(?!\w)" if expected[-1:].isalnum() else ""
    return len(re.findall(f"{prefix}{re.escape(expected)}{suffix}", value))


def validate_record(
    record: ProtectedSpanRecord,
    candidate: str,
    candidate_entities: Iterable[EntitySpan] | None = None,
    original_text: str | None = None,
) -> dict[str, Any]:
    if original_text is not None and text_sha256(original_text) != record.text_sha256:
        raise ValueError(
            "Protected-span record does not match the supplied original text"
        )
    expected_entities = Counter(
        _normalized_surface(span.text) for span in record.entities
    )
    actual_entity_counts = Counter(
        {surface: _surface_count(candidate, surface) for surface in expected_entities}
    )
    entities_preserved = expected_entities == actual_entity_counts

    actual_structured = extract_structured(candidate, record.language)
    structured_checks = {
        f"{field}_preserved": Counter(values)
        == Counter(actual_structured.get(field, []))
        for field, values in record.structured.items()
    }
    introduced = []
    if candidate_entities is not None:
        expected_pairs = Counter(
            (_normalized_surface(span.text), span.label) for span in record.entities
        )
        candidate_pairs = Counter(
            (_normalized_surface(span.text), span.label) for span in candidate_entities
        )
        introduced = [
            {
                "text": text,
                "label": label,
                "count": count - expected_pairs[(text, label)],
            }
            for (text, label), count in sorted(candidate_pairs.items())
            if count > expected_pairs[(text, label)]
            and (original_text is None or _surface_count(original_text, text) == 0)
        ]

    checks = {"entities_preserved": entities_preserved, **structured_checks}
    failure_reasons = [
        name.removesuffix("_preserved") for name, passed in checks.items() if not passed
    ]
    if introduced:
        failure_reasons.append("introduced_entities")
    expected = {
        "entities": list(expected_entities.elements()),
        **record.structured,
    }
    actual = {
        "entities": list(actual_entity_counts.elements()),
        **actual_structured,
    }
    return {
        **checks,
        "passes": all(checks.values()) and not introduced,
        "failure_reasons": failure_reasons,
        "introduced_entities": introduced,
        "expected": expected,
        "actual": actual,
        "protected_text_sha256": record.text_sha256,
    }


class GlinerEntityExtractor:
    def __init__(
        self,
        thresholds: dict[str, float],
        model_name: str = GLINER_MODEL,
        model_revision: str = GLINER_MODEL_REVISION,
        labels: tuple[str, ...] = GLINER_LABELS,
        device: str = "cuda",
        window_tokens: int = 320,
        overlap_tokens: int = 64,
    ) -> None:
        if set(thresholds) != {"en", "it"}:
            raise ValueError("GLiNER thresholds must contain exactly 'en' and 'it'")
        if not 0 < overlap_tokens < window_tokens:
            raise ValueError(
                "GLiNER overlap must be positive and smaller than the window"
            )
        try:
            from gliner import GLiNER
        except ImportError as error:
            raise RuntimeError(
                "GLiNER extraction requires the gliner package"
            ) from error
        self.thresholds = {key: float(value) for key, value in thresholds.items()}
        self.model_name = model_name
        self.model_revision = model_revision
        self.labels = labels
        self.device = device
        self.window_tokens = window_tokens
        self.overlap_tokens = overlap_tokens
        self.model = GLiNER.from_pretrained(
            model_name,
            revision=model_revision,
            map_location=device,
        )
        self.model.eval()

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "GLiNER zero-shot span extraction",
            "library_version": GLINER_VERSION,
            "model": self.model_name,
            "model_revision": self.model_revision,
            "labels": list(self.labels),
            "thresholds": self.thresholds,
            "device": self.device,
            "window_tokens": self.window_tokens,
            "overlap_tokens": self.overlap_tokens,
        }

    def extract(self, text: str, language: str) -> list[EntitySpan]:
        threshold = self.thresholds[language]
        spans = []
        for start, end in self._windows(text):
            chunk = text[start:end]
            for entity in self.model.predict_entities(
                chunk,
                list(self.labels),
                threshold=threshold,
            ):
                spans.append(
                    EntitySpan(
                        text=str(entity["text"]),
                        start=start + int(entity["start"]),
                        end=start + int(entity["end"]),
                        label=str(entity["label"]),
                        score=float(entity["score"]),
                    )
                )
        return self._merge(spans)

    def _windows(self, text: str) -> list[tuple[int, int]]:
        processor = getattr(self.model, "data_processor", None)
        tokenizer = getattr(processor, "transformer_tokenizer", None)
        if tokenizer is not None:
            encoded = tokenizer(
                text,
                add_special_tokens=False,
                return_offsets_mapping=True,
            )
            offsets = encoded.get("offset_mapping") or []
        else:
            offsets = [match.span() for match in re.finditer(r"\S+", text)]
        if not offsets:
            return [(0, len(text))]
        windows = []
        step = self.window_tokens - self.overlap_tokens
        for offset in range(0, len(offsets), step):
            batch = offsets[offset : offset + self.window_tokens]
            if not batch:
                break
            start, end = int(batch[0][0]), int(batch[-1][1])
            windows.append((start, end))
            if offset + self.window_tokens >= len(offsets):
                break
        return windows

    @staticmethod
    def _merge(spans: Iterable[EntitySpan]) -> list[EntitySpan]:
        best: dict[tuple[int, int, str, str], EntitySpan] = {}
        for span in spans:
            key = (span.start, span.end, span.text, span.label)
            if key not in best or span.score > best[key].score:
                best[key] = span
        ordered = sorted(
            best.values(),
            key=lambda span: (
                span.start,
                -(span.end - span.start),
                -span.score,
                span.label,
            ),
        )
        selected: list[EntitySpan] = []
        for span in ordered:
            overlaps = [
                current
                for current in selected
                if span.start < current.end and current.start < span.end
            ]
            if not overlaps:
                selected.append(span)
                continue
            winner = max(
                [span, *overlaps],
                key=lambda value: (value.end - value.start, value.score),
            )
            selected = [value for value in selected if value not in overlaps]
            selected.append(winner)
        return sorted(selected, key=lambda span: (span.start, span.end, span.label))


class ProtectedSpanManifestRunner:
    ARTIFACT_SCHEMA_VERSION = 3

    def __init__(self, extractor: EntityExtractor) -> None:
        self.extractor = extractor

    def run(
        self,
        generations_path: Path,
        output_path: Path,
        threshold_provenance: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        generations = _read_jsonl(generations_path)
        sources: dict[tuple[str, str], str] = {}
        for row in generations:
            language = str(row["language"])
            for field in ("unwatermarked_text", "watermarked_text"):
                text = row.get(field)
                if text:
                    sources.setdefault((text_sha256(str(text)), language), str(text))
        records = [
            ProtectedSpanRecord.build(
                text, language, self.extractor.extract(text, language)
            )
            for (_, language), text in sorted(sources.items())
        ]
        output_path.parent.mkdir(parents=True, exist_ok=True)
        _write_jsonl(output_path, [record.to_dict() for record in records])
        manifest = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "generations_sha256": hashlib.sha256(
                generations_path.read_bytes()
            ).hexdigest(),
            "record_count": len(records),
            "extractor": self.extractor.metadata,
            "threshold_provenance": threshold_provenance
            or {"human_approved": False, "status": "unspecified"},
        }
        _write_json(output_path.with_suffix(".manifest.json"), manifest)
        return manifest


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
