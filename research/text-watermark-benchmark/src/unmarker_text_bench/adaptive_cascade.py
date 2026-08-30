from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass, field, replace
from typing import Any, Protocol

from .attack_pipeline import SYSTEM_PROMPT, BiasTokenizer, Rewriter
from .llm_judge import JUDGE_SCHEMA, JUDGE_SYSTEM_PROMPT, StructuredJudgeBackend
from .metrics import levenshtein
from .protected_spans import (
    EntityExtractor,
    EntitySpan,
    ProtectedSpanRecord,
    protected_prompt_fragment,
)
from .self_information import (
    SelfInformationScorer,
    select_high_information,
    unique_token_strings,
)
from .tokenization import tokenize
from .unicode_hygiene import clean_unicode


@dataclass(frozen=True)
class CascadeRequest:
    request_id: str
    text: str
    language: str
    generator_family: str | None = None
    target_algorithm: str | None = None
    terminology: tuple[str, ...] = ()


@dataclass(frozen=True)
class ModelRoute:
    route_id: str
    family: str
    rewriter: Rewriter

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "route_id": self.route_id,
            "family": self.family,
            "rewriter": self.rewriter.metadata,
        }


@dataclass(frozen=True)
class GenerationCall:
    stage: str
    route_id: str
    family: str
    response: dict[str, Any]


@dataclass(frozen=True)
class CascadeCandidate:
    candidate_id: str
    text: str
    stage: str
    route_id: str
    model_family: str
    strength: float
    calls: tuple[GenerationCall, ...]
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DetectorSignal:
    detector_id: str
    kind: str
    score: float
    threshold: float
    operator: str
    detected: bool
    calibrated_margin: float
    model_version: str | None = None


@dataclass(frozen=True)
class JudgeSignals:
    material_error: bool
    fluency_score: int
    naturalness_score: int
    passes: bool
    reason_codes: tuple[str, ...] = ()
    evidence: str = ""
    meaning_preserved: bool = True
    factual_consistency: bool = True
    protected_facts_preserved: bool = True
    response: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CandidateEvaluation:
    candidate: CascadeCandidate
    deterministic_quality: dict[str, Any]
    semantic_similarity: float
    bidirectional_entailment: float
    judge: JudgeSignals | None
    detector_signals: tuple[DetectorSignal, ...]
    changed_token_ratio: float = 0.0
    token_edit_distance: int = 0
    quality_pass: bool = False
    detector_pass: bool = False
    accepted: bool = False
    rejection_reasons: tuple[str, ...] = ()

    @property
    def target_signals(self) -> tuple[DetectorSignal, ...]:
        return tuple(value for value in self.detector_signals if value.kind == "target")

    @property
    def generic_signals(self) -> tuple[DetectorSignal, ...]:
        return tuple(
            value for value in self.detector_signals if value.kind == "generic"
        )

    @property
    def maximum_generic_margin(self) -> float | None:
        values = [value.calibrated_margin for value in self.generic_signals]
        return max(values) if values else None

    @property
    def maximum_target_margin(self) -> float | None:
        values = [value.calibrated_margin for value in self.target_signals]
        return max(values) if values else None


@dataclass(frozen=True)
class CascadeConfig:
    conservative_strengths: tuple[float, ...] = (0.20, 0.30, 0.35)
    candidates_per_fallback_stage: int = 2
    chunk_strength: float = 0.45
    backtranslation_strength: float = 0.55
    structural_strength: float = 0.65
    position_aware_strength: float = 0.35
    maximum_changed_token_ratio: float = 0.45
    minimum_semantic_similarity: float = 0.90
    minimum_bidirectional_entailment: float = 0.80
    minimum_fluency_score: int = 4
    minimum_naturalness_score: int = 4
    minimum_generic_detectors: int = 1
    required_generic_detectors: tuple[str, ...] = ()
    require_judge: bool = True
    require_two_families_when_unknown: bool = True
    seed: int = 20260830
    maximum_chunk_characters: int = 1_200

    def __post_init__(self) -> None:
        strengths = (
            *self.conservative_strengths,
            self.chunk_strength,
            self.backtranslation_strength,
            self.structural_strength,
            self.position_aware_strength,
        )
        if not self.conservative_strengths or any(
            not 0 < value <= 1 for value in strengths
        ):
            raise ValueError("Cascade strengths must be in (0, 1]")
        if self.candidates_per_fallback_stage < 1:
            raise ValueError("candidates_per_fallback_stage must be positive")
        if not 0 < self.maximum_changed_token_ratio <= 1:
            raise ValueError("maximum_changed_token_ratio must be in (0, 1]")
        if not 0 <= self.minimum_semantic_similarity <= 1:
            raise ValueError("minimum_semantic_similarity must be in [0, 1]")
        if not 0 <= self.minimum_bidirectional_entailment <= 1:
            raise ValueError("minimum_bidirectional_entailment must be in [0, 1]")
        if not 1 <= self.minimum_fluency_score <= 5:
            raise ValueError("minimum_fluency_score must be in [1, 5]")
        if not 1 <= self.minimum_naturalness_score <= 5:
            raise ValueError("minimum_naturalness_score must be in [1, 5]")
        if self.minimum_generic_detectors < 0:
            raise ValueError("minimum_generic_detectors cannot be negative")
        if self.maximum_chunk_characters < 200:
            raise ValueError("maximum_chunk_characters must be at least 200")


@dataclass(frozen=True)
class CascadeResult:
    request: CascadeRequest
    status: str
    selected: CandidateEvaluation
    baseline: CandidateEvaluation
    rounds: tuple[dict[str, Any], ...]
    pareto_candidate_ids: tuple[str, ...]
    protected_record: ProtectedSpanRecord
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class CascadeEvaluator(Protocol):
    @property
    def metadata(self) -> dict[str, Any]: ...

    def evaluate_batch(
        self,
        request: CascadeRequest,
        candidates: Sequence[CascadeCandidate],
        protected_record: ProtectedSpanRecord,
    ) -> list[CandidateEvaluation]: ...


class PositionAwareGenerator(Protocol):
    @property
    def metadata(self) -> dict[str, Any]: ...

    def supports(self, route: ModelRoute) -> bool: ...

    def generate(
        self,
        request: CascadeRequest,
        route: ModelRoute,
        protected_record: ProtectedSpanRecord,
        strength: float,
        seed: int,
    ) -> CascadeCandidate: ...


class AdaptiveRewriteCascade:
    """Quality-gated, multi-model rewrite search with progressive stopping."""

    def __init__(
        self,
        routes: Sequence[ModelRoute],
        evaluator: CascadeEvaluator,
        entity_extractor: EntityExtractor,
        config: CascadeConfig | None = None,
        position_aware: PositionAwareGenerator | None = None,
    ) -> None:
        self.routes = tuple(routes)
        self.evaluator = evaluator
        self.entity_extractor = entity_extractor
        self.config = config or CascadeConfig()
        self.position_aware = position_aware
        self._validate_routes()

    def run(self, request: CascadeRequest) -> CascadeResult:
        if request.language not in {"en", "it"}:
            raise ValueError("Adaptive rewrite currently supports en and it")
        if not request.text.strip():
            raise ValueError("Rewrite input cannot be empty")
        routes = self._eligible_routes(request.generator_family)
        protected = ProtectedSpanRecord.build(
            request.text,
            request.language,
            self.entity_extractor.extract(request.text, request.language),
            terminology=request.terminology,
        )
        baseline_candidate = CascadeCandidate(
            candidate_id=f"{request.request_id}|original",
            text=request.text,
            stage="original",
            route_id="none",
            model_family=request.generator_family or "unknown",
            strength=0.0,
            calls=(),
        )
        baseline = self._finalize_evaluations(
            request,
            self.evaluator.evaluate_batch(request, [baseline_candidate], protected),
        )[0]
        if baseline.detector_pass:
            return CascadeResult(
                request=request,
                status="not_needed",
                selected=baseline,
                baseline=baseline,
                rounds=(),
                pareto_candidate_ids=(baseline.candidate.candidate_id,),
                protected_record=protected,
                metadata=self._metadata(
                    routes,
                    "input already clears configured detectors",
                    [baseline],
                ),
            )

        all_evaluations: list[CandidateEvaluation] = []
        rounds: list[dict[str, Any]] = []
        stage_builders = [
            ("conservative", lambda: self._conservative(request, routes, protected)),
            ("contextual_chunk", lambda: self._chunked(request, routes, protected)),
            (
                "backtranslation",
                lambda: self._backtranslated(request, routes, protected),
            ),
            ("structural", lambda: self._structural(request, routes, protected)),
        ]
        if self.position_aware is not None and baseline.target_signals:
            stage_builders.append(
                (
                    "position_aware_bira",
                    lambda: self._position_aware(request, routes, protected),
                )
            )

        for stage, builder in stage_builders:
            generated = builder()
            if not generated:
                rounds.append({"stage": stage, "status": "no_candidates"})
                continue
            evaluated = self._finalize_evaluations(
                request,
                self.evaluator.evaluate_batch(request, generated, protected),
            )
            all_evaluations.extend(evaluated)
            accepted = [value for value in evaluated if value.accepted]
            front = pareto_front(accepted)
            rounds.append(
                {
                    "stage": stage,
                    "status": "accepted" if front else "continue",
                    "candidate_ids": [
                        value.candidate.candidate_id for value in evaluated
                    ],
                    "accepted_ids": [
                        value.candidate.candidate_id for value in accepted
                    ],
                    "pareto_ids": [value.candidate.candidate_id for value in front],
                    "evaluations": [asdict(value) for value in evaluated],
                }
            )
            if front:
                selected = select_from_pareto(front)
                return CascadeResult(
                    request=request,
                    status="accepted",
                    selected=selected,
                    baseline=baseline,
                    rounds=tuple(rounds),
                    pareto_candidate_ids=tuple(
                        value.candidate.candidate_id for value in front
                    ),
                    protected_record=protected,
                    metadata=self._metadata(
                        routes,
                        "first accepted round",
                        [baseline, *all_evaluations],
                    ),
                )

        pool = [value for value in all_evaluations if value.quality_pass]
        if not pool:
            pool = all_evaluations
        if not pool:
            raise RuntimeError("Adaptive cascade produced no candidate")
        front = pareto_front(pool)
        selected = select_from_pareto(front)
        return CascadeResult(
            request=request,
            status="best_effort",
            selected=selected,
            baseline=baseline,
            rounds=tuple(rounds),
            pareto_candidate_ids=tuple(value.candidate.candidate_id for value in front),
            protected_record=protected,
            metadata=self._metadata(
                routes,
                "no candidate cleared every configured gate",
                [baseline, *all_evaluations],
            ),
        )

    def _conservative(
        self,
        request: CascadeRequest,
        routes: Sequence[ModelRoute],
        protected: ProtectedSpanRecord,
    ) -> list[CascadeCandidate]:
        values = []
        for index, strength in enumerate(self.config.conservative_strengths):
            route = routes[index % len(routes)]
            values.append(
                self._direct_candidate(
                    request,
                    route,
                    protected,
                    "conservative",
                    strength,
                    index,
                )
            )
        return values

    def _chunked(
        self,
        request: CascadeRequest,
        routes: Sequence[ModelRoute],
        protected: ProtectedSpanRecord,
    ) -> list[CascadeCandidate]:
        output = []
        for index, route in enumerate(self._fallback_routes(routes)):
            chunks = _contextual_chunks(
                request.text,
                self.config.maximum_chunk_characters,
            )
            rewritten = []
            calls = []
            for chunk_index, chunk in enumerate(chunks):
                chunk_record = _subset_record(protected, chunk)
                previous = chunks[chunk_index - 1][-240:] if chunk_index else ""
                following = (
                    chunks[chunk_index + 1][:240]
                    if chunk_index + 1 < len(chunks)
                    else ""
                )
                prompt = (
                    "Rewrite only TARGET. PREVIOUS and NEXT are context and must not be returned. "
                    f"Change roughly {round(self.config.chunk_strength * 100)}% of the wording.\n\n"
                    f"{protected_prompt_fragment(chunk_record)}\n\n"
                    f"<PREVIOUS>{previous}</PREVIOUS>\n"
                    f"<TARGET>{chunk}</TARGET>\n"
                    f"<NEXT>{following}</NEXT>"
                )
                response = route.rewriter.rewrite(
                    SYSTEM_PROMPT,
                    prompt,
                    seed=self._seed(request.request_id, "chunk", index, chunk_index),
                )
                value = _clean_rewrite(response.text)
                rewritten.append(value)
                calls.append(_generation_call("contextual_chunk", route, response))
            text = _join_chunks(request.text, chunks, rewritten)
            output.append(
                CascadeCandidate(
                    candidate_id=f"{request.request_id}|contextual_chunk|{route.route_id}",
                    text=text,
                    stage="contextual_chunk",
                    route_id=route.route_id,
                    model_family=route.family,
                    strength=self.config.chunk_strength,
                    calls=tuple(calls),
                    metadata={"chunk_count": len(chunks), "chunk_shuffle": False},
                )
            )
        return output

    def _backtranslated(
        self,
        request: CascadeRequest,
        routes: Sequence[ModelRoute],
        protected: ProtectedSpanRecord,
    ) -> list[CascadeCandidate]:
        pivot = "French" if request.language == "en" else "English"
        source_language = "English" if request.language == "en" else "Italian"
        output = []
        for index, route in enumerate(self._fallback_routes(routes)):
            seed = self._seed(request.request_id, "backtranslation", index)
            first = route.rewriter.rewrite(
                SYSTEM_PROMPT,
                (
                    f"Translate SOURCE into {pivot}. Keep protected strings verbatim. "
                    "Return only the translation.\n\n"
                    f"{protected_prompt_fragment(protected)}\n\n"
                    f"<SOURCE>{request.text}</SOURCE>"
                ),
                seed=seed,
            )
            second = route.rewriter.rewrite(
                SYSTEM_PROMPT,
                (
                    f"Translate PIVOT into natural {source_language}. Use SOURCE only to verify "
                    "facts and protected strings; do not copy its sentence structure. Return only "
                    "the final translation.\n\n"
                    f"{protected_prompt_fragment(protected)}\n\n"
                    f"<SOURCE>{request.text}</SOURCE>\n\n"
                    f"<PIVOT>{_clean_rewrite(first.text)}</PIVOT>"
                ),
                seed=seed + 1,
            )
            output.append(
                CascadeCandidate(
                    candidate_id=f"{request.request_id}|backtranslation|{route.route_id}",
                    text=_clean_rewrite(second.text),
                    stage="backtranslation",
                    route_id=route.route_id,
                    model_family=route.family,
                    strength=self.config.backtranslation_strength,
                    calls=(
                        _generation_call("backtranslation_out", route, first),
                        _generation_call("backtranslation_back", route, second),
                    ),
                    metadata={"pivot_language": pivot},
                )
            )
        return output

    def _structural(
        self,
        request: CascadeRequest,
        routes: Sequence[ModelRoute],
        protected: ProtectedSpanRecord,
    ) -> list[CascadeCandidate]:
        output = []
        for index, route in enumerate(self._fallback_routes(routes)):
            seed = self._seed(request.request_id, "structural", index)
            outline = route.rewriter.rewrite(
                SYSTEM_PROMPT,
                (
                    "Extract a compact ordered outline of every factual claim and logical "
                    "relationship in SOURCE. Do not add facts.\n\n"
                    f"<SOURCE>{request.text}</SOURCE>"
                ),
                seed=seed,
            )
            rewritten = route.rewriter.rewrite(
                SYSTEM_PROMPT,
                (
                    "Write a fluent passage in the same language as SOURCE from OUTLINE. Vary "
                    "sentence boundaries and discourse structure while preserving every fact and "
                    "protected string. Return only the passage.\n\n"
                    f"{protected_prompt_fragment(protected)}\n\n"
                    f"<SOURCE>{request.text}</SOURCE>\n\n"
                    f"<OUTLINE>{_clean_rewrite(outline.text)}</OUTLINE>"
                ),
                seed=seed + 1,
            )
            output.append(
                CascadeCandidate(
                    candidate_id=f"{request.request_id}|structural|{route.route_id}",
                    text=_clean_rewrite(rewritten.text),
                    stage="structural",
                    route_id=route.route_id,
                    model_family=route.family,
                    strength=self.config.structural_strength,
                    calls=(
                        _generation_call("structural_outline", route, outline),
                        _generation_call("structural_regeneration", route, rewritten),
                    ),
                )
            )
        return output

    def _position_aware(
        self,
        request: CascadeRequest,
        routes: Sequence[ModelRoute],
        protected: ProtectedSpanRecord,
    ) -> list[CascadeCandidate]:
        assert self.position_aware is not None
        return [
            self.position_aware.generate(
                request,
                route,
                protected,
                self.config.position_aware_strength,
                self._seed(request.request_id, "position", index),
            )
            for index, route in enumerate(self._fallback_routes(routes))
            if self.position_aware.supports(route)
        ]

    def _direct_candidate(
        self,
        request: CascadeRequest,
        route: ModelRoute,
        protected: ProtectedSpanRecord,
        stage: str,
        strength: float,
        index: int,
    ) -> CascadeCandidate:
        response = route.rewriter.rewrite(
            SYSTEM_PROMPT,
            (
                f"Rewrite roughly {round(strength * 100)}% of the wording. Prefer local, "
                "low-divergence edits and preserve the remainder when natural.\n\n"
                f"{protected_prompt_fragment(protected)}\n\n"
                f"<SOURCE>{request.text}</SOURCE>"
            ),
            seed=self._seed(request.request_id, stage, index),
        )
        return CascadeCandidate(
            candidate_id=f"{request.request_id}|{stage}|{index}|{route.route_id}",
            text=_clean_rewrite(response.text),
            stage=stage,
            route_id=route.route_id,
            model_family=route.family,
            strength=strength,
            calls=(_generation_call(stage, route, response),),
        )

    def _finalize_evaluations(
        self,
        request: CascadeRequest,
        evaluations: Sequence[CandidateEvaluation],
    ) -> list[CandidateEvaluation]:
        output = []
        for value in evaluations:
            source_tokens = [token.text.lower() for token in tokenize(request.text)]
            candidate_tokens = [
                token.text.lower() for token in tokenize(value.candidate.text)
            ]
            distance = levenshtein(source_tokens, candidate_tokens)
            ratio = distance / max(len(source_tokens), 1)
            reasons = []
            if not bool(value.deterministic_quality.get("passes")):
                reasons.extend(value.deterministic_quality.get("failure_reasons", []))
            if value.semantic_similarity < self.config.minimum_semantic_similarity:
                reasons.append("semantic_similarity")
            if (
                value.bidirectional_entailment
                < self.config.minimum_bidirectional_entailment
            ):
                reasons.append("bidirectional_entailment")
            if ratio > self.config.maximum_changed_token_ratio:
                reasons.append("changed_token_ratio")
            if self.config.require_judge and value.judge is None:
                reasons.append("missing_judge")
            if value.judge is not None:
                if value.judge.material_error:
                    reasons.append("material_error")
                if value.judge.fluency_score < self.config.minimum_fluency_score:
                    reasons.append("fluency")
                if (
                    value.judge.naturalness_score
                    < self.config.minimum_naturalness_score
                ):
                    reasons.append("naturalness")
                if not (
                    value.judge.meaning_preserved
                    and value.judge.factual_consistency
                    and value.judge.protected_facts_preserved
                ):
                    reasons.append("judge_quality")
            quality_pass = not reasons

            generic = {signal.detector_id: signal for signal in value.generic_signals}
            missing_required = sorted(
                set(self.config.required_generic_detectors) - set(generic)
            )
            target_pass = all(not signal.detected for signal in value.target_signals)
            generic_pass = (
                len(generic) >= self.config.minimum_generic_detectors
                and not missing_required
                and all(not signal.detected for signal in generic.values())
            )
            detector_evidence = bool(value.target_signals) or bool(generic)
            detector_pass = detector_evidence and target_pass and generic_pass
            if not detector_evidence:
                reasons.append("missing_detector_evidence")
            if missing_required:
                reasons.append("missing_required_detectors")
            if not target_pass:
                reasons.append("target_detector")
            if not generic_pass:
                reasons.append("generic_detector_ensemble")
            output.append(
                replace(
                    value,
                    token_edit_distance=distance,
                    changed_token_ratio=ratio,
                    quality_pass=quality_pass,
                    detector_pass=detector_pass,
                    accepted=quality_pass and detector_pass,
                    rejection_reasons=tuple(
                        dict.fromkeys(str(reason) for reason in reasons)
                    ),
                )
            )
        return output

    def _eligible_routes(self, generator_family: str | None) -> tuple[ModelRoute, ...]:
        routes = tuple(
            route
            for route in self.routes
            if generator_family is None or route.family != generator_family
        )
        if not routes:
            raise ValueError(
                "No rewrite route remains after excluding the generator family"
            )
        families = {route.family for route in routes}
        if (
            generator_family is None
            and self.config.require_two_families_when_unknown
            and len(families) < 2
        ):
            raise ValueError(
                "Unknown generator requires at least two rewrite model families"
            )
        return routes

    def _fallback_routes(self, routes: Sequence[ModelRoute]) -> tuple[ModelRoute, ...]:
        selected = []
        seen_families = set()
        for route in routes:
            if route.family in seen_families:
                continue
            selected.append(route)
            seen_families.add(route.family)
            if len(selected) == self.config.candidates_per_fallback_stage:
                break
        if len(selected) < self.config.candidates_per_fallback_stage:
            for route in routes:
                if route not in selected:
                    selected.append(route)
                if len(selected) == self.config.candidates_per_fallback_stage:
                    break
        return tuple(selected)

    def _metadata(
        self,
        routes: Sequence[ModelRoute],
        stop_reason: str,
        evaluations: Sequence[CandidateEvaluation] = (),
    ) -> dict[str, Any]:
        calls = [
            call for evaluation in evaluations for call in evaluation.candidate.calls
        ]
        judge_responses = [
            evaluation.judge.response
            for evaluation in evaluations
            if evaluation.judge is not None and evaluation.judge.response
        ]
        generation_cost = sum(
            float(call.response.get("cost_usd") or 0.0) for call in calls
        )
        judge_cost = sum(
            float(response.get("cost_usd") or 0.0) for response in judge_responses
        )
        return {
            "implementation": "adaptive-multi-family-pareto-cascade-v1",
            "stop_reason": stop_reason,
            "config": asdict(self.config),
            "routes": [route.metadata for route in routes],
            "evaluator": self.evaluator.metadata,
            "entity_extractor": self.entity_extractor.metadata,
            "position_aware": (
                self.position_aware.metadata
                if self.position_aware is not None
                else None
            ),
            "usage": {
                "generation_calls": len(calls),
                "judge_calls": len(judge_responses),
                "prompt_tokens": sum(
                    int(call.response.get("prompt_tokens") or 0) for call in calls
                )
                + sum(
                    int(response.get("prompt_tokens") or 0)
                    for response in judge_responses
                ),
                "completion_tokens": sum(
                    int(call.response.get("completion_tokens") or 0) for call in calls
                )
                + sum(
                    int(response.get("completion_tokens") or 0)
                    for response in judge_responses
                ),
                "latency_ms": sum(
                    float(call.response.get("latency_ms") or 0.0) for call in calls
                )
                + sum(
                    float(response.get("latency_ms") or 0.0)
                    for response in judge_responses
                ),
                "generation_cost_usd": generation_cost,
                "judge_cost_usd": judge_cost,
                "cost_usd": generation_cost + judge_cost,
            },
        }

    def _seed(self, request_id: str, stage: str, *indexes: int) -> int:
        payload = "|".join(
            [
                str(self.config.seed),
                request_id,
                stage,
                *(str(value) for value in indexes),
            ]
        )
        return int.from_bytes(
            hashlib.blake2b(payload.encode(), digest_size=4).digest(), "big"
        )

    def _validate_routes(self) -> None:
        if not self.routes:
            raise ValueError("At least one rewrite route is required")
        route_ids = [route.route_id for route in self.routes]
        if len(route_ids) != len(set(route_ids)):
            raise ValueError("Rewrite route IDs must be unique")
        if any(not route.route_id or not route.family for route in self.routes):
            raise ValueError("Every rewrite route requires an ID and family")


class PositionAwareBiraGenerator:
    def __init__(
        self,
        scorer: SelfInformationScorer,
        bias_tokenizer: BiasTokenizer,
        beta: float = -5.0,
        minimum_spacing: int = 2,
        max_token_ids: int = 300,
        route_ids: tuple[str, ...] = (),
    ) -> None:
        if beta >= 0:
            raise ValueError("BIRA beta must be negative")
        self.scorer = scorer
        self.bias_tokenizer = bias_tokenizer
        self.beta = beta
        self.minimum_spacing = minimum_spacing
        self.max_token_ids = max_token_ids
        self.route_ids = route_ids

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "position-aware-bira-adaptive-v1",
            "scorer": self.scorer.metadata,
            "bias_tokenizer": {
                "model": self.bias_tokenizer.model_name,
                "revision": self.bias_tokenizer.revision,
            },
            "beta": self.beta,
            "minimum_spacing": self.minimum_spacing,
            "max_token_ids": self.max_token_ids,
            "route_ids": list(self.route_ids),
        }

    def supports(self, route: ModelRoute) -> bool:
        return not self.route_ids or route.route_id in self.route_ids

    def generate(
        self,
        request: CascadeRequest,
        route: ModelRoute,
        protected_record: ProtectedSpanRecord,
        strength: float,
        seed: int,
    ) -> CascadeCandidate:
        scores = self.scorer.score(request.text)
        selected = select_high_information(scores, strength, self.minimum_spacing)
        token_strings = unique_token_strings(selected)
        bias = self.bias_tokenizer.build_bias(
            token_strings,
            self.beta,
            self.max_token_ids,
        )
        response = route.rewriter.rewrite(
            SYSTEM_PROMPT,
            (
                "Produce a low-divergence fluent paraphrase. Token-level lexical constraints are "
                "applied separately.\n\n"
                f"{protected_prompt_fragment(protected_record)}\n\n"
                f"<SOURCE>{request.text}</SOURCE>"
            ),
            logit_bias=bias,
            seed=seed,
        )
        return CascadeCandidate(
            candidate_id=f"{request.request_id}|position_aware_bira|{route.route_id}",
            text=_clean_rewrite(response.text),
            stage="position_aware_bira",
            route_id=route.route_id,
            model_family=route.family,
            strength=strength,
            calls=(_generation_call("position_aware_bira", route, response),),
            metadata={
                "selected_token_count": len(selected),
                "selected_token_indices": [value.index for value in selected],
                "logit_bias_count": len(bias),
                "beta": self.beta,
            },
        )


class StructuredPairJudge:
    def __init__(self, backend: StructuredJudgeBackend, seed: int = 20260830) -> None:
        self.backend = backend
        self.seed = seed

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "structured-frontier-pair-judge-v1",
            "backend": self.backend.metadata,
            "seed": self.seed,
        }

    def evaluate(
        self,
        request: CascadeRequest,
        candidate: CascadeCandidate,
    ) -> JudgeSignals:
        seed = int.from_bytes(
            hashlib.blake2b(
                f"{self.seed}|{candidate.candidate_id}".encode(), digest_size=4
            ).digest(),
            "big",
        )
        response = self.backend.complete_json(
            JUDGE_SYSTEM_PROMPT,
            (
                f"Language: {request.language}\n\n"
                f"<SOURCE>{request.text}</SOURCE>\n\n"
                f"<CANDIDATE>{candidate.text}</CANDIDATE>"
            ),
            "adaptive_text_quality_assessment",
            JUDGE_SCHEMA,
            seed=seed,
        )
        value = response.data
        passes = (
            bool(value["meaning_preserved"])
            and bool(value["factual_consistency"])
            and bool(value["protected_facts_preserved"])
            and not bool(value["material_error"])
            and int(value["fluency_score"]) >= 4
            and int(value["naturalness_score"]) >= 4
        )
        return JudgeSignals(
            material_error=bool(value["material_error"]),
            fluency_score=int(value["fluency_score"]),
            naturalness_score=int(value["naturalness_score"]),
            passes=passes,
            reason_codes=tuple(str(item) for item in value["reason_codes"]),
            evidence=str(value["evidence"]),
            meaning_preserved=bool(value["meaning_preserved"]),
            factual_consistency=bool(value["factual_consistency"]),
            protected_facts_preserved=bool(value["protected_facts_preserved"]),
            response=asdict(response),
        )


def pareto_front(
    evaluations: Iterable[CandidateEvaluation],
) -> list[CandidateEvaluation]:
    values = list(evaluations)
    return [
        candidate
        for candidate in values
        if not any(
            other is not candidate and _dominates(other, candidate) for other in values
        )
    ]


def select_from_pareto(
    evaluations: Sequence[CandidateEvaluation],
) -> CandidateEvaluation:
    if not evaluations:
        raise ValueError("Cannot select from an empty Pareto front")
    return min(
        evaluations,
        key=lambda value: (
            not value.accepted,
            max(
                value.maximum_target_margin
                if value.maximum_target_margin is not None
                else float("-inf"),
                value.maximum_generic_margin
                if value.maximum_generic_margin is not None
                else float("-inf"),
            ),
            bool(value.judge.material_error) if value.judge else True,
            -min(value.semantic_similarity, value.bidirectional_entailment),
            value.changed_token_ratio,
            -(value.judge.fluency_score if value.judge else 0),
            value.candidate.candidate_id,
        ),
    )


def _dominates(left: CandidateEvaluation, right: CandidateEvaluation) -> bool:
    left_values = _objectives(left)
    right_values = _objectives(right)
    return all(a <= b for a, b in zip(left_values, right_values, strict=True)) and any(
        a < b for a, b in zip(left_values, right_values, strict=True)
    )


def _objectives(value: CandidateEvaluation) -> tuple[float, ...]:
    return (
        value.maximum_target_margin or 0.0,
        value.maximum_generic_margin or 0.0,
        value.changed_token_ratio,
        -value.semantic_similarity,
        -value.bidirectional_entailment,
        float(value.judge.material_error) if value.judge else 1.0,
        -float(value.judge.fluency_score) if value.judge else 0.0,
    )


def calibrated_detector_signal(
    detector_id: str,
    kind: str,
    score: float,
    threshold: float,
    operator: str,
    model_version: str | None = None,
) -> DetectorSignal:
    scale = max(abs(threshold), 0.1)
    if operator == "gt":
        detected = score > threshold
        margin = (score - threshold) / scale
    elif operator == "lt":
        detected = score < threshold
        margin = (threshold - score) / scale
    else:
        raise ValueError("Detector operator must be gt or lt")
    return DetectorSignal(
        detector_id=detector_id,
        kind=kind,
        score=float(score),
        threshold=float(threshold),
        operator=operator,
        detected=detected,
        calibrated_margin=float(margin),
        model_version=model_version,
    )


def _generation_call(stage: str, route: ModelRoute, response: Any) -> GenerationCall:
    return GenerationCall(
        stage=stage,
        route_id=route.route_id,
        family=route.family,
        response=asdict(response),
    )


def _clean_rewrite(text: str) -> str:
    value = text.strip()
    if value.startswith("```") and value.endswith("```"):
        value = "\n".join(value.splitlines()[1:-1]).strip()
    prefixes = ("Rewritten passage:", "Rewritten text:", "Testo riscritto:")
    for prefix in prefixes:
        if value.lower().startswith(prefix.lower()):
            value = value[len(prefix) :].lstrip()
    return clean_unicode(value).text


def _contextual_chunks(text: str, maximum_characters: int) -> list[str]:
    paragraphs = [value for value in re.split(r"\n{2,}", text) if value]
    if not paragraphs:
        return [text]
    chunks = []
    for paragraph in paragraphs:
        if len(paragraph) <= maximum_characters:
            chunks.append(paragraph)
            continue
        sentences = re.split(r"(?<=[.!?])\s+", paragraph)
        current = ""
        for sentence in sentences:
            proposed = f"{current} {sentence}".strip()
            if current and len(proposed) > maximum_characters:
                chunks.append(current)
                current = sentence
            else:
                current = proposed
        if current:
            chunks.append(current)
    return chunks or [text]


def _join_chunks(source: str, chunks: Sequence[str], rewritten: Sequence[str]) -> str:
    if len(chunks) != len(rewritten):
        raise ValueError("Chunk and rewrite counts differ")
    cursor = 0
    values = []
    for chunk, replacement in zip(chunks, rewritten, strict=True):
        start = source.find(chunk, cursor)
        if start < 0:
            raise ValueError("Cannot map contextual chunk back to source")
        values.append(source[cursor:start])
        values.append(replacement)
        cursor = start + len(chunk)
    values.append(source[cursor:])
    return "".join(values)


def _subset_record(record: ProtectedSpanRecord, text: str) -> ProtectedSpanRecord:
    entities = []
    for entity in record.entities:
        for match in re.finditer(re.escape(entity.text), text):
            entities.append(
                EntitySpan(
                    text=entity.text,
                    start=match.start(),
                    end=match.end(),
                    label=entity.label,
                    score=entity.score,
                )
            )
    return ProtectedSpanRecord.build(
        text,
        record.language,
        entities,
        terminology=record.structured.get("terminology", []),
    )
