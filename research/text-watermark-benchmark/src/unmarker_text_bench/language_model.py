from __future__ import annotations

import math
from collections import Counter
from collections.abc import Iterable, Sequence

from .lexicon import VariantLexicon
from .tokenization import tokenize
from .types import Sample, Token


class ReferenceNgramScorer:
    """Small deterministic causal scorer used for fast, offline benchmark runs.

    It deliberately exposes the same interface expected from a future Hugging Face
    causal model adapter. It is not presented as a substitute for model logits.
    """

    def __init__(self, samples: Iterable[Sample], lexicon: VariantLexicon) -> None:
        self.lexicon = lexicon
        self.unigrams: Counter[str] = Counter()
        self.bigrams: Counter[tuple[str, str]] = Counter()
        self.language_by_token: dict[str, str] = {}
        for sample in samples:
            previous = "<bos>"
            for token in tokenize(sample.text):
                if not token.is_word:
                    continue
                current = token.text.lower()
                self.unigrams[current] += 1
                self.bigrams[(previous, current)] += 1
                self.language_by_token[current] = sample.language
                previous = current
        self.total = sum(self.unigrams.values())

    def token_probability(self, tokens: Sequence[Token], index: int, candidate: str) -> float:
        language = self._language(candidate)
        previous = self._previous_word(tokens, index)
        vocabulary = max(len(self.unigrams), 1)
        bigram_count = self.bigrams[(previous, candidate.lower())]
        previous_count = self.unigrams[previous] if previous != "<bos>" else max(vocabulary, 1)
        conditional = (bigram_count + 0.15) / (previous_count + 0.15 * vocabulary)
        unigram = (self.unigrams[candidate.lower()] + 0.25) / (self.total + 0.25 * vocabulary)
        prior = self.lexicon.prior(candidate, language)
        return max(1e-9, 0.55 * conditional + 0.35 * unigram + 0.10 * prior)

    def self_information(self, tokens: Sequence[Token], index: int) -> float:
        return -math.log(self.token_probability(tokens, index, tokens[index].text))

    def ranked_alternatives(
        self,
        tokens: Sequence[Token],
        index: int,
        language: str,
        excluded: set[str] | None = None,
    ) -> list[str]:
        excluded = excluded or set()
        alternatives = self.lexicon.alternatives(tokens[index].text, language)
        return sorted(
            (candidate for candidate in alternatives if candidate.lower() not in excluded),
            key=lambda candidate: self.token_probability(tokens, index, candidate),
            reverse=True,
        )

    def _language(self, token: str) -> str:
        known = self.language_by_token.get(token.lower())
        if known:
            return known
        if self.lexicon.alternatives(token, "it"):
            return "it"
        return "en"

    @staticmethod
    def _previous_word(tokens: Sequence[Token], index: int) -> str:
        for candidate in reversed(tokens[:index]):
            if candidate.is_word:
                return candidate.text.lower()
        return "<bos>"
