from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, Sequence


@dataclass(frozen=True)
class Sample:
    id: str
    language: str
    text: str


@dataclass(frozen=True)
class Token:
    text: str
    start: int
    end: int
    is_word: bool
    protected: bool = False


@dataclass(frozen=True)
class RewriteCandidate:
    text: str
    pipeline: str
    budget: str
    changed_positions: tuple[int, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DetectorDecision:
    name: str
    score: float
    threshold: float
    detected: bool


@dataclass(frozen=True)
class QualityReport:
    semantic_similarity: float
    nli_proxy: float
    protected_preservation: float
    negation_preservation: float
    entities_preserved: bool
    numbers_preserved: bool
    urls_preserved: bool
    passes: bool


@dataclass(frozen=True)
class RunMetrics:
    token_edit_distance: int
    changed_token_ratio: float
    character_edit_distance: int
    quality: QualityReport
    latency_ms: float
    estimated_cost_per_1k_tokens: float


class ScoringModel(Protocol):
    def self_information(self, tokens: Sequence[Token], index: int) -> float: ...

    def token_probability(self, tokens: Sequence[Token], index: int, candidate: str) -> float: ...


class RewritePipeline(Protocol):
    name: str

    def rewrite(
        self,
        text: str,
        language: str,
        budget_name: str,
        budget_ratio: float,
    ) -> RewriteCandidate: ...
