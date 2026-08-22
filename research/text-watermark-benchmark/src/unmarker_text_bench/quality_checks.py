from __future__ import annotations

import re
from collections import Counter
from dataclasses import asdict, dataclass
from typing import Any

from .tokenization import (
    extract_entities,
    extract_negations,
    extract_numbers,
    extract_urls,
)

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
QUOTED_RE = re.compile(r'(?:"([^"]+)"|“([^”]+)”|‘([^’]+)’)')


@dataclass(frozen=True)
class DeterministicQuality:
    entities_preserved: bool
    numbers_preserved: bool
    urls_preserved: bool
    emails_preserved: bool
    quotations_preserved: bool
    negations_preserved: bool
    passes: bool
    expected: dict[str, list[str]]
    actual: dict[str, list[str]]
    failure_reasons: tuple[str, ...] = ()
    introduced_entities: tuple[dict[str, Any], ...] = ()
    protected_text_sha256: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def extract_protected(text: str, language: str) -> dict[str, list[str]]:
    quotations = []
    for match in QUOTED_RE.finditer(text):
        quotations.append(next(value for value in match.groups() if value is not None))
    return {
        "entities": list(extract_entities(text)),
        "numbers": list(extract_numbers(text)),
        "urls": list(extract_urls(text)),
        "emails": EMAIL_RE.findall(text),
        "quotations": quotations,
        "negations": list(extract_negations(text, language)),
    }


def deterministic_quality(
    original: str,
    candidate: str,
    language: str,
    protected_record: Any | None = None,
    candidate_entities: Any | None = None,
) -> DeterministicQuality:
    if protected_record is not None:
        from .protected_spans import validate_record

        payload = validate_record(
            protected_record,
            candidate,
            candidate_entities,
            original_text=original,
        )
        return DeterministicQuality(
            entities_preserved=bool(payload["entities_preserved"]),
            numbers_preserved=bool(payload["numbers_preserved"]),
            urls_preserved=bool(payload["urls_preserved"]),
            emails_preserved=bool(payload["emails_preserved"]),
            quotations_preserved=bool(payload["quotations_preserved"]),
            negations_preserved=bool(payload["negations_preserved"]),
            passes=bool(payload["passes"]),
            expected=payload["expected"],
            actual=payload["actual"],
            failure_reasons=tuple(payload["failure_reasons"]),
            introduced_entities=tuple(payload["introduced_entities"]),
            protected_text_sha256=payload["protected_text_sha256"],
        )
    expected = extract_protected(original, language)
    actual = extract_protected(candidate, language)

    def same(field: str) -> bool:
        return Counter(expected[field]) == Counter(actual[field])

    checks = {
        "entities_preserved": same("entities"),
        "numbers_preserved": same("numbers"),
        "urls_preserved": same("urls"),
        "emails_preserved": same("emails"),
        "quotations_preserved": same("quotations"),
        "negations_preserved": same("negations"),
    }
    return DeterministicQuality(
        **checks,
        passes=all(checks.values()),
        expected=expected,
        actual=actual,
        failure_reasons=tuple(
            name.removesuffix("_preserved")
            for name, passed in checks.items()
            if not passed
        ),
    )


def protected_prompt_fragment(text: str, language: str) -> str:
    protected = extract_protected(text, language)
    nonempty = {key: value for key, value in protected.items() if value}
    if not nonempty:
        return "There are no extracted protected spans. Preserve all facts and polarity anyway."
    lines = [
        "The following values must remain verbatim and with the same multiplicity:"
    ]
    for field, values in nonempty.items():
        lines.append(f"- {field}: {values!r}")
    return "\n".join(lines)


def distinct_unigram_ratio(
    text: str, tokenizer: Any | None = None, tail: int = 450
) -> float:
    if tokenizer is None:
        values = re.findall(r"\w+|[^\w\s]", text.lower(), re.UNICODE)
    else:
        values = tokenizer(text, add_special_tokens=False)["input_ids"]
    values = values[-tail:]
    return len(set(values)) / len(values) if values else 0.0
