from __future__ import annotations

import unicodedata
from dataclasses import asdict, dataclass

from .tokenization import NUMBER_RE, tokenize

NUMBER_CONTEXT_STOPWORDS = {
    "en": {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "been",
        "by",
        "for",
        "from",
        "had",
        "has",
        "have",
        "he",
        "her",
        "his",
        "in",
        "is",
        "it",
        "of",
        "on",
        "or",
        "she",
        "that",
        "the",
        "their",
        "to",
        "was",
        "were",
        "which",
        "with",
    },
    "it": {
        "a",
        "al",
        "alla",
        "anche",
        "che",
        "con",
        "da",
        "dal",
        "dalla",
        "dei",
        "del",
        "della",
        "di",
        "e",
        "era",
        "è",
        "gli",
        "ha",
        "hanno",
        "i",
        "il",
        "in",
        "la",
        "le",
        "lo",
        "nel",
        "nella",
        "o",
        "per",
        "si",
        "sono",
        "su",
        "tra",
        "un",
        "una",
    },
}

SENTENCE_BOUNDARIES = {".", "!", "?", ";", ":"}
CONTEXT_WORDS_PER_SIDE = 6
MIN_ALTERNATIVE_SIMILARITY = 0.50
MIN_SIMILARITY_MARGIN = 0.30


@dataclass(frozen=True)
class NumberContextBinding:
    number: str
    anchors: tuple[str, ...]


def _normalize_word(value: str) -> str:
    return unicodedata.normalize("NFKC", value).casefold()


def extract_number_context_bindings(
    text: str,
    language: str,
    words_per_side: int = CONTEXT_WORDS_PER_SIDE,
) -> tuple[NumberContextBinding, ...]:
    tokens = tokenize(text)
    stopwords = NUMBER_CONTEXT_STOPWORDS.get(
        language,
        NUMBER_CONTEXT_STOPWORDS["en"] | NUMBER_CONTEXT_STOPWORDS["it"],
    )
    bindings = []
    for index, token in enumerate(tokens):
        if not NUMBER_RE.match(token.text):
            continue
        anchors: list[str] = []
        for direction in (-1, 1):
            found: list[str] = []
            cursor = index + direction
            while 0 <= cursor < len(tokens) and len(found) < words_per_side:
                nearby = tokens[cursor]
                if nearby.text in SENTENCE_BOUNDARIES:
                    break
                if nearby.is_word and not NUMBER_RE.match(nearby.text):
                    normalized = _normalize_word(nearby.text)
                    if len(normalized) > 2 and normalized not in stopwords:
                        found.append(normalized)
                cursor += direction
            anchors.extend(reversed(found) if direction == -1 else found)
        bindings.append(
            NumberContextBinding(
                number=token.text,
                anchors=tuple(dict.fromkeys(anchors)),
            )
        )
    return tuple(bindings)


def _similarity(left: NumberContextBinding, right: NumberContextBinding) -> float:
    left_values = set(left.anchors)
    right_values = set(right.anchors)
    if not left_values or not right_values:
        return 0.0
    return len(left_values & right_values) / len(left_values | right_values)


def number_context_conflicts(
    original: str,
    candidate: str,
    language: str,
) -> tuple[dict[str, object], ...]:
    """Return high-confidence number swaps while tolerating ordinary paraphrase.

    Exact number preservation is handled separately. This check only considers
    candidates with the same number multiset and flags an occurrence when its
    local lexical context is substantially closer to a *different* source
    number than to the matching source number.
    """

    original_bindings = extract_number_context_bindings(original, language)
    candidate_bindings = extract_number_context_bindings(candidate, language)
    if sorted(binding.number for binding in original_bindings) != sorted(
        binding.number for binding in candidate_bindings
    ):
        return ()
    if len({binding.number for binding in original_bindings}) < 2:
        return ()

    conflicts = []
    for candidate_binding in candidate_bindings:
        matching = [
            binding
            for binding in original_bindings
            if binding.number == candidate_binding.number
        ]
        alternatives = [
            binding
            for binding in original_bindings
            if binding.number != candidate_binding.number
        ]
        identity_similarity = max(
            (_similarity(candidate_binding, binding) for binding in matching),
            default=0.0,
        )
        alternative = max(
            alternatives,
            key=lambda binding: _similarity(candidate_binding, binding),
            default=None,
        )
        if alternative is None:
            continue
        alternative_similarity = _similarity(candidate_binding, alternative)
        if (
            alternative_similarity >= MIN_ALTERNATIVE_SIMILARITY
            and alternative_similarity - identity_similarity >= MIN_SIMILARITY_MARGIN
        ):
            conflicts.append(
                {
                    "candidate_number": candidate_binding.number,
                    "source_context_number": alternative.number,
                    "identity_similarity": round(identity_similarity, 6),
                    "alternative_similarity": round(alternative_similarity, 6),
                    "shared_anchors": sorted(
                        set(candidate_binding.anchors) & set(alternative.anchors)
                    ),
                    "candidate_binding": asdict(candidate_binding),
                    "source_binding": asdict(alternative),
                }
            )
    return tuple(conflicts)


def number_contexts_preserved(
    original: str,
    candidate: str,
    language: str,
) -> bool:
    return not number_context_conflicts(original, candidate, language)
