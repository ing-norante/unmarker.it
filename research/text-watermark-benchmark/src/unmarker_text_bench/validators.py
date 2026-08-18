from __future__ import annotations

from collections import Counter

from .lexicon import VariantLexicon
from .tokenization import (
    extract_entities,
    extract_negations,
    extract_numbers,
    extract_urls,
    tokenize,
)
from .types import QualityReport


STOPWORDS = {
    "en": {"a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "be", "that"},
    "it": {"un", "una", "il", "lo", "la", "i", "gli", "le", "e", "o", "di", "a", "in", "per", "con", "è", "sono", "che"},
}


class QualityValidator:
    def __init__(
        self,
        lexicon: VariantLexicon,
        semantic_threshold: float = 0.90,
        nli_threshold: float = 0.90,
    ) -> None:
        self.lexicon = lexicon
        self.semantic_threshold = semantic_threshold
        self.nli_threshold = nli_threshold

    def evaluate(self, original: str, candidate: str, language: str) -> QualityReport:
        original_content = self._content_counter(original, language)
        candidate_content = self._content_counter(candidate, language)
        semantic = self._multiset_f1(original_content, candidate_content)
        content_recall = self._recall(original_content, candidate_content)

        original_entities = extract_entities(original)
        candidate_entities = extract_entities(candidate)
        original_numbers = extract_numbers(original)
        candidate_numbers = extract_numbers(candidate)
        original_urls = extract_urls(original)
        candidate_urls = extract_urls(candidate)
        original_negations = extract_negations(original, language)
        candidate_negations = extract_negations(candidate, language)

        entities_preserved = original_entities == candidate_entities
        numbers_preserved = original_numbers == candidate_numbers
        urls_preserved = original_urls == candidate_urls
        protected_components = (entities_preserved, numbers_preserved, urls_preserved)
        protected_preservation = sum(protected_components) / len(protected_components)
        negation_preservation = 1.0 if original_negations == candidate_negations else 0.0
        nli_proxy = min(content_recall, protected_preservation, negation_preservation)
        passes = (
            semantic >= self.semantic_threshold
            and nli_proxy >= self.nli_threshold
            and protected_preservation == 1.0
            and negation_preservation == 1.0
        )
        return QualityReport(
            semantic,
            nli_proxy,
            protected_preservation,
            negation_preservation,
            entities_preserved,
            numbers_preserved,
            urls_preserved,
            passes,
        )

    def _content_counter(self, text: str, language: str) -> Counter[str]:
        stopwords = STOPWORDS.get(language, set())
        return Counter(
            self.lexicon.canonical(token.text, language)
            for token in tokenize(text)
            if token.is_word and token.text.lower() not in stopwords
        )

    @staticmethod
    def _multiset_f1(left: Counter[str], right: Counter[str]) -> float:
        overlap = sum((left & right).values())
        if not left and not right:
            return 1.0
        precision = overlap / max(sum(right.values()), 1)
        recall = overlap / max(sum(left.values()), 1)
        return 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    @staticmethod
    def _recall(expected: Counter[str], actual: Counter[str]) -> float:
        if not expected:
            return 1.0
        return sum((expected & actual).values()) / sum(expected.values())
