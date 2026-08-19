from __future__ import annotations

import hashlib
import math
from collections.abc import Sequence

from .language_model import ReferenceNgramScorer
from .lexicon import VariantLexicon
from .tokenization import replace_tokens, tokenize
from .types import RewriteCandidate, Token


def _stable_order(index: int, token: Token, salt: str) -> int:
    digest = hashlib.blake2b(f"{salt}|{index}|{token.text}".encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big")


class ReferenceRewritePipeline:
    name = "reference"

    def __init__(self, lexicon: VariantLexicon, scorer: ReferenceNgramScorer) -> None:
        self.lexicon = lexicon
        self.scorer = scorer

    def eligible(self, tokens: Sequence[Token], language: str) -> list[int]:
        return [
            index
            for index, token in enumerate(tokens)
            if not token.protected and self.lexicon.rewrite_alternatives(token.text, language)
        ]

    def best_replacement(
        self,
        tokens: Sequence[Token],
        index: int,
        language: str,
        excluded: set[str] | None = None,
    ) -> str | None:
        blocked = {tokens[index].text.lower()}
        blocked.update(excluded or set())
        candidates = self.scorer.ranked_alternatives(tokens, index, language, blocked)
        return candidates[0] if candidates else None


class SimpleParaphrasePipeline(ReferenceRewritePipeline):
    name = "simple_paraphrase"

    def rewrite(self, text: str, language: str, budget_name: str, budget_ratio: float) -> RewriteCandidate:
        tokens = tokenize(text)
        eligible = sorted(self.eligible(tokens, language), key=lambda i: _stable_order(i, tokens[i], self.name))
        target_count = max(1, math.ceil(len(eligible) * budget_ratio)) if eligible else 0
        replacements: dict[int, str] = {}
        for index in eligible[:target_count]:
            alternatives = self.lexicon.rewrite_alternatives(tokens[index].text, language)
            if alternatives:
                replacements[index] = alternatives[0]
        return RewriteCandidate(
            replace_tokens(text, tokens, replacements),
            self.name,
            budget_name,
            tuple(sorted(replacements)),
            {"reference_implementation": True},
        )


class SiraPipeline(ReferenceRewritePipeline):
    name = "sira"

    def rewrite(self, text: str, language: str, budget_name: str, budget_ratio: float) -> RewriteCandidate:
        tokens = tokenize(text)
        eligible = sorted(
            self.eligible(tokens, language),
            key=lambda index: self.scorer.self_information(tokens, index),
            reverse=True,
        )
        target_count = max(1, math.ceil(len(eligible) * budget_ratio)) if eligible else 0
        replacements: dict[int, str] = {}
        for index in eligible[:target_count]:
            replacement = self.best_replacement(tokens, index, language)
            if replacement:
                replacements[index] = replacement
        return RewriteCandidate(
            replace_tokens(text, tokens, replacements),
            self.name,
            budget_name,
            tuple(sorted(replacements)),
            {
                "reference_implementation": True,
                "selection": "highest_self_information",
                "paper_default_mask_ratio": 0.70,
            },
        )


class BiraPipeline(ReferenceRewritePipeline):
    name = "bira"

    def rewrite(self, text: str, language: str, budget_name: str, budget_ratio: float) -> RewriteCandidate:
        tokens = tokenize(text)
        eligible = self.eligible(tokens, language)
        information_by_type: dict[str, list[float]] = {}
        for index in eligible:
            information_by_type.setdefault(tokens[index].text.lower(), []).append(
                self.scorer.self_information(tokens, index)
            )
        type_scores = {
            token_type: sum(values) / len(values)
            for token_type, values in information_by_type.items()
        }
        suspicious = sorted(
            eligible,
            key=lambda index: (
                type_scores[tokens[index].text.lower()],
                _stable_order(index, tokens[index], self.name),
            ),
            reverse=True,
        )
        target_count = max(1, math.ceil(len(suspicious) * budget_ratio)) if suspicious else 0
        suspect_types = {tokens[index].text.lower() for index in suspicious[:target_count]}
        replacements: dict[int, str] = {}
        for index in suspicious[:target_count]:
            alternatives = self.scorer.ranked_alternatives(tokens, index, language, suspect_types)
            if not alternatives:
                alternatives = self.scorer.ranked_alternatives(
                    tokens,
                    index,
                    language,
                    {tokens[index].text.lower()},
                )
            if alternatives and alternatives[0].lower() != tokens[index].text.lower():
                replacements[index] = alternatives[0]
        return RewriteCandidate(
            replace_tokens(text, tokens, replacements),
            self.name,
            budget_name,
            tuple(sorted(replacements)),
            {
                "reference_implementation": True,
                "selection": "global_mean_self_information_by_token_type",
                "proxy_suppression_types": sorted(suspect_types),
                "budget_normalized": True,
            },
        )


class PositionAwareBiraPipeline(ReferenceRewritePipeline):
    name = "bira_position_aware"

    def rewrite(self, text: str, language: str, budget_name: str, budget_ratio: float) -> RewriteCandidate:
        tokens = tokenize(text)
        eligible = sorted(
            self.eligible(tokens, language),
            key=lambda index: self.scorer.self_information(tokens, index),
            reverse=True,
        )
        target_count = max(1, math.ceil(len(eligible) * budget_ratio)) if eligible else 0
        selected = self._spread_positions(eligible, target_count)
        replacements: dict[int, str] = {}
        for index in selected:
            original_type = tokens[index].text.lower()
            replacement = self.best_replacement(tokens, index, language, {original_type})
            if replacement:
                replacements[index] = replacement
        return RewriteCandidate(
            replace_tokens(text, tokens, replacements),
            self.name,
            budget_name,
            tuple(sorted(replacements)),
            {
                "reference_implementation": True,
                "selection": "position_level_self_information",
                "selection_spacing": "greedy_non_adjacent_then_fill",
                "budget_ratio": budget_ratio,
            },
        )

    @staticmethod
    def _spread_positions(ranked: list[int], target_count: int, radius: int = 3) -> list[int]:
        """Prefer edits whose downstream context windows do not overlap.

        Context-keyed watermarks can change score after an upstream edit. Spreading
        edits is a query-free way to maximize affected contexts without knowing the
        detector key or exact n-gram length.
        """
        selected: list[int] = []
        for index in ranked:
            if all(abs(index - existing) > radius for existing in selected):
                selected.append(index)
                if len(selected) >= target_count:
                    return selected
        for index in ranked:
            if index not in selected:
                selected.append(index)
                if len(selected) >= target_count:
                    break
        return selected


def default_pipelines(
    lexicon: VariantLexicon,
    scorer: ReferenceNgramScorer,
) -> dict[str, ReferenceRewritePipeline]:
    return {
        pipeline.name: pipeline
        for pipeline in (
            SimpleParaphrasePipeline(lexicon, scorer),
            SiraPipeline(lexicon, scorer),
            BiraPipeline(lexicon, scorer),
            PositionAwareBiraPipeline(lexicon, scorer),
        )
    }
