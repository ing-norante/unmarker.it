from __future__ import annotations

import hashlib
import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from .language_model import ReferenceNgramScorer
from .lexicon import VariantLexicon
from .tokenization import replace_tokens, tokenize
from .types import DetectorDecision, Sample, Token


def _g_value(key: str, context: str, candidate: str, layer: int = 0) -> float:
    payload = f"{key}|{layer}|{context}|{candidate.lower()}".encode("utf-8")
    digest = hashlib.blake2b(payload, digest_size=8).digest()
    return int.from_bytes(digest, "big") / float(2**64 - 1)


@dataclass
class SurrogateWatermark:
    name: str
    key: str
    lexicon: VariantLexicon
    scorer: ReferenceNgramScorer
    threshold: float = math.inf
    fpr: float = 0.01
    thresholds_by_language: dict[str, float] | None = None
    _score_cache: dict[tuple[str, str], list[tuple[str, str, float]]] = field(
        default_factory=dict,
        repr=False,
    )

    def embed(self, text: str, language: str) -> str:
        tokens = tokenize(text)
        replacements: dict[int, str] = {}
        for index, token in enumerate(tokens):
            alternatives = self.lexicon.alternatives(token.text, language)
            if token.protected or len(alternatives) < 2:
                continue
            context = self._context(tokens, index)
            replacements[index] = max(
                alternatives,
                key=lambda candidate: self._embedding_objective(tokens, index, context, candidate),
            )
        return replace_tokens(text, tokens, replacements)

    def calibrate(self, clean_samples: Iterable[Sample], null_keys: int = 128) -> dict[str, float]:
        scores_by_language: dict[str, list[float]] = {}
        samples = list(clean_samples)
        for null_index in range(null_keys):
            null_key = f"null-{self.name}-{null_index}"
            for sample in samples:
                score = self._score_with_key(sample.text, sample.language, null_key)
                if not math.isnan(score):
                    scores_by_language.setdefault(sample.language, []).append(score)
        if not scores_by_language:
            raise ValueError(f"Cannot calibrate {self.name}: no editable tokens in corpus")
        thresholds: dict[str, float] = {}
        for language, scores in scores_by_language.items():
            scores.sort()
            quantile_index = min(len(scores) - 1, math.ceil((1.0 - self.fpr) * len(scores)) - 1)
            thresholds[language] = scores[quantile_index]
        self.thresholds_by_language = thresholds
        self.threshold = mean_threshold = sum(thresholds.values()) / len(thresholds)
        return {**thresholds, "fallback": mean_threshold}

    def decide(self, text: str, language: str) -> DetectorDecision:
        score = self.score(text, language)
        thresholds = self.thresholds_by_language or {}
        threshold = thresholds.get(language, self.threshold)
        return DetectorDecision(self.name, score, threshold, score >= threshold)

    def score(self, text: str, language: str) -> float:
        return self._score_with_key(text, language, self.key)

    def _score_with_key(self, text: str, language: str, key: str) -> float:
        weighted_sum = 0.0
        weight_total = 0.0
        for context, token_text, weight in self._prepared_score_inputs(text, language):
            contribution = self._contribution(key, context, token_text)
            weighted_sum += contribution * weight
            weight_total += weight
        return weighted_sum / weight_total if weight_total else math.nan

    def _prepared_score_inputs(self, text: str, language: str) -> list[tuple[str, str, float]]:
        cache_key = (language, text)
        cached = self._score_cache.get(cache_key)
        if cached is not None:
            return cached
        tokens = tokenize(text)
        prepared: list[tuple[str, str, float]] = []
        for index, token in enumerate(tokens):
            alternatives = self.lexicon.alternatives(token.text, language)
            if token.protected or len(alternatives) < 2:
                continue
            information = self.scorer.self_information(tokens, index)
            weight = 0.5 + min(information, 8.0) / 8.0
            prepared.append((self._context(tokens, index), token.text, weight))
        self._score_cache[cache_key] = prepared
        return prepared

    def _embedding_objective(
        self,
        tokens: Sequence[Token],
        index: int,
        context: str,
        candidate: str,
    ) -> float:
        probability = self.scorer.token_probability(tokens, index, candidate)
        # Detection strength dominates, while the small probability term keeps
        # deterministic ties closer to the reference language distribution.
        return 8.0 * self._embedding_signal(context, candidate) + 0.04 * math.log(probability)

    def _embedding_signal(self, context: str, candidate: str) -> float:
        return _g_value(self.key, context, candidate)

    def _contribution(self, key: str, context: str, candidate: str) -> float:
        return 1.0 if _g_value(key, context, candidate) >= 0.5 else 0.0

    def _context(self, tokens: Sequence[Token], index: int) -> str:
        return "global"


class UnigramSurrogate(SurrogateWatermark):
    def __init__(self, key: str, lexicon: VariantLexicon, scorer: ReferenceNgramScorer) -> None:
        super().__init__("unigram", key, lexicon, scorer)


class KgwSurrogate(SurrogateWatermark):
    def __init__(self, key: str, lexicon: VariantLexicon, scorer: ReferenceNgramScorer) -> None:
        super().__init__("kgw", key, lexicon, scorer)

    def _context(self, tokens: Sequence[Token], index: int) -> str:
        for token in reversed(tokens[:index]):
            if token.is_word:
                return token.text.lower()
        return "<bos>"


class SynthIdTournamentSurrogate(SurrogateWatermark):
    # A single keyed tournament score keeps the controlled short-text fixture
    # detectable. This is a benchmark surrogate, not Google's production setup.
    layers = 1

    def __init__(self, key: str, lexicon: VariantLexicon, scorer: ReferenceNgramScorer) -> None:
        super().__init__("synthid_tournament", key, lexicon, scorer)

    def _context(self, tokens: Sequence[Token], index: int) -> str:
        words = [token.text.lower() for token in tokens[:index] if token.is_word]
        return "|".join(words[-3:]) if words else "<bos>"

    def _embedding_signal(self, context: str, candidate: str) -> float:
        return sum(_g_value(self.key, context, candidate, layer) for layer in range(self.layers)) / self.layers

    def _contribution(self, key: str, context: str, candidate: str) -> float:
        return sum(_g_value(key, context, candidate, layer) for layer in range(self.layers)) / self.layers


def default_surrogates(
    lexicon: VariantLexicon,
    scorer: ReferenceNgramScorer,
) -> list[SurrogateWatermark]:
    return [
        KgwSurrogate("unmarker-bench-kgw-v1", lexicon, scorer),
        UnigramSurrogate("unmarker-bench-unigram-v1", lexicon, scorer),
        SynthIdTournamentSurrogate("unmarker-bench-synthid-v1", lexicon, scorer),
    ]
