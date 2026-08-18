from __future__ import annotations

from collections.abc import Sequence

from .tokenization import tokenize
from .types import RunMetrics
from .validators import QualityValidator


def levenshtein(left: Sequence[str] | str, right: Sequence[str] | str) -> int:
    if len(left) < len(right):
        left, right = right, left
    previous = list(range(len(right) + 1))
    for left_index, left_value in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_value in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[right_index] + 1,
                    previous[right_index - 1] + (left_value != right_value),
                )
            )
        previous = current
    return previous[-1]


def measure_run(
    original: str,
    candidate: str,
    language: str,
    validator: QualityValidator,
    latency_ms: float,
    cost_per_1k_tokens: float,
) -> RunMetrics:
    original_tokens = [token.text.lower() for token in tokenize(original)]
    candidate_tokens = [token.text.lower() for token in tokenize(candidate)]
    token_distance = levenshtein(original_tokens, candidate_tokens)
    return RunMetrics(
        token_edit_distance=token_distance,
        changed_token_ratio=token_distance / max(len(original_tokens), 1),
        character_edit_distance=levenshtein(original, candidate),
        quality=validator.evaluate(original, candidate, language),
        latency_ms=latency_ms,
        estimated_cost_per_1k_tokens=cost_per_1k_tokens,
    )
