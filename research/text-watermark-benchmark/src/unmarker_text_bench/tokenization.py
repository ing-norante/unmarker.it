from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

from .types import Token


TOKEN_RE = re.compile(
    r"https?://[^\s]+|[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’][A-Za-zÀ-ÖØ-öø-ÿ]+)?|\d+(?:[.,:/-]\d+)*|[^\w\s]",
    re.UNICODE,
)
URL_RE = re.compile(r"^https?://", re.IGNORECASE)
NUMBER_RE = re.compile(r"^\d")

NEGATIONS = {
    "en": {"not", "no", "never", "neither", "nor", "without"},
    "it": {"non", "no", "mai", "né", "senza", "nessuno", "nessuna"},
}


def tokenize(text: str) -> list[Token]:
    raw = [
        Token(
            text=match.group(0),
            start=match.start(),
            end=match.end(),
            is_word=bool(re.match(r"^[\wÀ-ÖØ-öø-ÿ]", match.group(0), re.UNICODE)),
        )
        for match in TOKEN_RE.finditer(text)
    ]
    protected_indexes = _protected_indexes(raw, text)
    return [
        Token(token.text, token.start, token.end, token.is_word, index in protected_indexes)
        for index, token in enumerate(raw)
    ]


def _protected_indexes(tokens: Sequence[Token], text: str) -> set[int]:
    protected: set[int] = set()
    sentence_start = True
    quote_stack: list[str] = []

    for index, token in enumerate(tokens):
        normalized = token.text.lower()
        if URL_RE.match(token.text) or NUMBER_RE.match(token.text):
            protected.add(index)
        if normalized in NEGATIONS["en"] | NEGATIONS["it"]:
            protected.add(index)
        if token.text in {'"', "“", "”", "‘", "’"}:
            if quote_stack:
                quote_stack.pop()
            else:
                quote_stack.append(token.text)
            protected.add(index)
        elif quote_stack:
            protected.add(index)
        if token.is_word and token.text[:1].isupper() and not sentence_start:
            protected.add(index)

        if token.text in {".", "!", "?", ":"}:
            sentence_start = True
        elif token.is_word:
            sentence_start = False

    return protected


def replace_tokens(text: str, tokens: Sequence[Token], replacements: dict[int, str]) -> str:
    parts: list[str] = []
    cursor = 0
    for index, token in enumerate(tokens):
        parts.append(text[cursor : token.start])
        parts.append(_match_case(replacements.get(index, token.text), token.text))
        cursor = token.end
    parts.append(text[cursor:])
    return "".join(parts)


def _match_case(replacement: str, original: str) -> str:
    if original.isupper():
        return replacement.upper()
    if original[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def word_values(tokens: Iterable[Token]) -> list[str]:
    return [token.text.lower() for token in tokens if token.is_word]


def extract_numbers(text: str) -> tuple[str, ...]:
    return tuple(token.text for token in tokenize(text) if NUMBER_RE.match(token.text))


def extract_urls(text: str) -> tuple[str, ...]:
    return tuple(token.text for token in tokenize(text) if URL_RE.match(token.text))


def extract_entities(text: str) -> tuple[str, ...]:
    return tuple(
        token.text
        for token in tokenize(text)
        if token.protected
        and token.is_word
        and token.text[:1].isupper()
        and token.text.lower() not in NEGATIONS["en"] | NEGATIONS["it"]
    )


def extract_negations(text: str, language: str) -> tuple[str, ...]:
    allowed = NEGATIONS.get(language, NEGATIONS["en"] | NEGATIONS["it"])
    return tuple(token.text.lower() for token in tokenize(text) if token.text.lower() in allowed)
