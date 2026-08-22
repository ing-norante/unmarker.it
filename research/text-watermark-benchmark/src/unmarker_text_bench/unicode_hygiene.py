from __future__ import annotations

import unicodedata
from dataclasses import asdict, dataclass
from typing import Literal

Action = Literal["removed", "replaced", "normalized", "preserved", "reported"]


@dataclass(frozen=True)
class UnicodeFinding:
    index: int
    codepoint: str
    name: str
    action: Action
    reason: str
    replacement: str | None = None

    def to_dict(self) -> dict[str, int | str | None]:
        return asdict(self)


@dataclass(frozen=True)
class UnicodeHygieneResult:
    text: str
    changed: bool
    findings: tuple[UnicodeFinding, ...]
    removed_count: int
    replaced_count: int
    normalized_count: int
    preserved_or_reported_count: int
    nfkc_enabled: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "text": self.text,
            "changed": self.changed,
            "findings": [finding.to_dict() for finding in self.findings],
            "removed_count": self.removed_count,
            "replaced_count": self.replaced_count,
            "normalized_count": self.normalized_count,
            "preserved_or_reported_count": self.preserved_or_reported_count,
            "nfkc_enabled": self.nfkc_enabled,
        }

    def audit_dict(self) -> dict[str, object]:
        payload = self.to_dict()
        del payload["text"]
        return payload


_ALWAYS_REMOVE = {
    "\u00ad": "soft hyphen",
    "\u034f": "combining grapheme joiner",
    "\u180e": "Mongolian vowel separator",
    "\u200b": "zero-width space",
    "\u2060": "word joiner",
    "\u2061": "function application",
    "\u2062": "invisible times",
    "\u2063": "invisible separator",
    "\u2064": "invisible plus",
    "\ufeff": "zero-width no-break space/BOM",
}

_SPACE_REPLACEMENTS = {
    "\u00a0",
    "\u1680",
    "\u2000",
    "\u2001",
    "\u2002",
    "\u2003",
    "\u2004",
    "\u2005",
    "\u2006",
    "\u2007",
    "\u2008",
    "\u2009",
    "\u200a",
    "\u202f",
    "\u205f",
    "\u3000",
}

_BIDI_EMBEDDINGS = {"\u202a", "\u202b"}
_BIDI_OVERRIDES = {"\u202d", "\u202e"}
_BIDI_PDF = "\u202c"
_BIDI_ISOLATES = {"\u2066", "\u2067", "\u2068"}
_BIDI_PDI = "\u2069"
_BIDI_MARKS = {"\u061c", "\u200e", "\u200f"}


def clean_unicode(text: str, *, nfkc: bool = False) -> UnicodeHygieneResult:
    """Remove high-confidence invisible carriers while preserving valid Unicode use.

    NFKC is intentionally opt-in because compatibility normalization can alter
    typography, mathematical notation, identifiers, and non-Latin text.
    Unknown format controls and private-use characters are reported, not removed.
    """

    original = text
    findings: list[UnicodeFinding] = []
    if nfkc:
        normalized = unicodedata.normalize("NFKC", text)
        if normalized != text:
            findings.append(
                UnicodeFinding(
                    index=-1,
                    codepoint="NFKC",
                    name="Unicode compatibility normalization",
                    action="normalized",
                    reason="explicit opt-in compatibility normalization",
                )
            )
        text = normalized

    bidi_actions = _bidi_actions(text)
    protected_tags = _valid_tag_sequence_indices(text)
    output: list[str] = []
    for index, char in enumerate(text):
        codepoint = f"U+{ord(char):04X}"
        name = unicodedata.name(char, "UNNAMED")
        replacement: str | None = None
        action: Action | None = None
        reason = ""

        if index in bidi_actions:
            action, reason = bidi_actions[index]
        elif char in _ALWAYS_REMOVE:
            action = "removed"
            reason = f"high-confidence invisible carrier: {_ALWAYS_REMOVE[char]}"
        elif char in _SPACE_REPLACEMENTS:
            action = "replaced"
            replacement = " "
            reason = "space-like character canonicalized to ASCII space"
        elif char in {"\u200c", "\u200d"}:
            if _valid_join_control(text, index, char):
                action = "preserved"
                reason = "valid shaping or emoji join sequence"
            else:
                action = "removed"
                reason = "join control outside a recognized shaping or emoji sequence"
        elif _is_variation_selector(char):
            if _valid_variation_selector(text, index):
                action = "preserved"
                reason = "variation selector attached to a recognized base character"
            else:
                action = "removed"
                reason = "floating or unsupported variation selector"
        elif _is_tag_character(char):
            if index in protected_tags:
                action = "preserved"
                reason = "valid emoji subdivision-flag tag sequence"
            else:
                action = "removed"
                reason = "floating or incomplete Unicode tag character"
        elif char in _BIDI_MARKS:
            action = "preserved"
            reason = "directional mark retained because it can be semantically required"
        elif unicodedata.category(char) == "Cf":
            action = "reported"
            reason = "unknown format control retained for conservative handling"
        elif unicodedata.category(char) == "Co":
            action = "reported"
            reason = "private-use character retained for conservative handling"

        if action is None:
            output.append(char)
            continue
        findings.append(
            UnicodeFinding(index, codepoint, name, action, reason, replacement)
        )
        if action in {"preserved", "reported"}:
            output.append(char)
        elif action == "replaced":
            output.append(replacement or "")

    cleaned = "".join(output)
    return UnicodeHygieneResult(
        text=cleaned,
        changed=cleaned != original,
        findings=tuple(findings),
        removed_count=sum(finding.action == "removed" for finding in findings),
        replaced_count=sum(finding.action == "replaced" for finding in findings),
        normalized_count=sum(finding.action == "normalized" for finding in findings),
        preserved_or_reported_count=sum(
            finding.action in {"preserved", "reported"} for finding in findings
        ),
        nfkc_enabled=nfkc,
    )


def inspect_unicode(text: str) -> tuple[UnicodeFinding, ...]:
    """Return the conservative hygiene findings without applying the output."""

    return clean_unicode(text).findings


def _bidi_actions(text: str) -> dict[int, tuple[Action, str]]:
    actions: dict[int, tuple[Action, str]] = {}
    embedding_stack: list[tuple[int, str]] = []
    isolate_stack: list[int] = []
    for index, char in enumerate(text):
        if char in _BIDI_EMBEDDINGS | _BIDI_OVERRIDES:
            embedding_stack.append((index, char))
        elif char == _BIDI_PDF:
            if not embedding_stack:
                actions[index] = ("removed", "unpaired bidi pop formatting control")
                continue
            opener_index, opener = embedding_stack.pop()
            if opener in _BIDI_OVERRIDES:
                actions[opener_index] = (
                    "removed",
                    "bidi override removed to prevent display-order spoofing",
                )
                actions[index] = (
                    "removed",
                    "terminator paired with removed bidi override",
                )
            else:
                actions[opener_index] = (
                    "preserved",
                    "balanced directional embedding retained",
                )
                actions[index] = (
                    "preserved",
                    "terminator for balanced directional embedding",
                )
        elif char in _BIDI_ISOLATES:
            isolate_stack.append(index)
        elif char == _BIDI_PDI:
            if not isolate_stack:
                actions[index] = ("removed", "unpaired bidi isolate terminator")
                continue
            opener_index = isolate_stack.pop()
            actions[opener_index] = ("preserved", "balanced bidi isolate retained")
            actions[index] = ("preserved", "terminator for balanced bidi isolate")
    for index, _ in embedding_stack:
        actions[index] = ("removed", "unpaired bidi embedding or override")
    for index in isolate_stack:
        actions[index] = ("removed", "unpaired bidi isolate")
    return actions


def _valid_join_control(text: str, index: int, char: str) -> bool:
    previous = _previous_non_mark(text, index)
    following = _next_non_mark(text, index)
    if previous is None or following is None:
        return False
    if char == "\u200d" and (_is_emoji(previous) or _is_emoji(following)):
        return True
    previous_script = _joining_script(previous)
    return bool(previous_script and previous_script == _joining_script(following))


def _valid_variation_selector(text: str, index: int) -> bool:
    previous = _previous_non_mark(text, index)
    if previous is None:
        return False
    codepoint = ord(text[index])
    if codepoint in {0xFE0E, 0xFE0F}:
        return _is_emoji(previous) or _is_symbol(previous)
    return _is_cjk(previous)


def _valid_tag_sequence_indices(text: str) -> set[int]:
    protected: set[int] = set()
    index = 0
    while index < len(text):
        if ord(text[index]) != 0x1F3F4:
            index += 1
            continue
        cursor = index + 1
        tags = []
        while cursor < len(text) and 0xE0061 <= ord(text[cursor]) <= 0xE007A:
            tags.append(cursor)
            cursor += 1
        if tags and cursor < len(text) and ord(text[cursor]) == 0xE007F:
            protected.update(tags)
            protected.add(cursor)
        index = max(cursor + 1, index + 1)
    return protected


def _previous_non_mark(text: str, index: int) -> str | None:
    for char in reversed(text[:index]):
        if unicodedata.category(char) not in {"Mn", "Me"}:
            return char
    return None


def _next_non_mark(text: str, index: int) -> str | None:
    for char in text[index + 1 :]:
        if unicodedata.category(char) not in {"Mn", "Me"}:
            return char
    return None


def _joining_script(char: str) -> str | None:
    name = unicodedata.name(char, "")
    for script in (
        "ARABIC",
        "SYRIAC",
        "THAANA",
        "NKO",
        "MANDAIC",
        "MONGOLIAN",
        "DEVANAGARI",
        "BENGALI",
        "GURMUKHI",
        "GUJARATI",
        "ORIYA",
        "TAMIL",
        "TELUGU",
        "KANNADA",
        "MALAYALAM",
        "SINHALA",
        "KHMER",
    ):
        if script in name:
            return script
    return None


def _is_emoji(char: str) -> bool:
    value = ord(char)
    return (
        0x1F000 <= value <= 0x1FAFF
        or 0x2600 <= value <= 0x27BF
        or 0x2300 <= value <= 0x23FF
    )


def _is_symbol(char: str) -> bool:
    return unicodedata.category(char).startswith("S")


def _is_cjk(char: str) -> bool:
    value = ord(char)
    return (
        0x3400 <= value <= 0x9FFF
        or 0xF900 <= value <= 0xFAFF
        or 0x20000 <= value <= 0x323AF
    )


def _is_variation_selector(char: str) -> bool:
    value = ord(char)
    return 0xFE00 <= value <= 0xFE0F or 0xE0100 <= value <= 0xE01EF


def _is_tag_character(char: str) -> bool:
    value = ord(char)
    return 0xE0000 <= value <= 0xE007F
