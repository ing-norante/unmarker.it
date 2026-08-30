from __future__ import annotations

import hashlib
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Protocol

from .adaptive_cascade import (
    CandidateEvaluation,
    CascadeCandidate,
    CascadeRequest,
    DetectorSignal,
    JudgeSignals,
    StructuredPairJudge,
    calibrated_detector_signal,
)
from .protected_spans import EntityExtractor, ProtectedSpanRecord
from .quality_checks import deterministic_quality
from .remote_evaluation import QualityBackend


class GenericDetectorBackend(Protocol):
    detector_id: str

    @property
    def metadata(self) -> dict[str, Any]: ...

    def detect(self, document: dict[str, Any]) -> dict[str, Any]: ...


class TargetDetectorBackend(Protocol):
    @property
    def metadata(self) -> dict[str, Any]: ...

    def detect(self, algorithm: str, text: str) -> Any: ...


class PairJudge(Protocol):
    @property
    def metadata(self) -> dict[str, Any]: ...

    def evaluate(
        self,
        request: CascadeRequest,
        candidate: CascadeCandidate,
    ) -> JudgeSignals: ...


@dataclass(frozen=True)
class CalibratedGenericDetector:
    backend: GenericDetectorBackend
    thresholds: dict[str, float]
    operators: dict[str, str]

    @property
    def detector_id(self) -> str:
        return self.backend.detector_id

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "detector_id": self.detector_id,
            "backend": self.backend.metadata,
            "thresholds": self.thresholds,
            "operators": self.operators,
        }

    def evaluate(
        self,
        request: CascadeRequest,
        candidate: CascadeCandidate,
    ) -> DetectorSignal:
        document = {
            "document_id": candidate.candidate_id,
            "text_sha256": hashlib.sha256(candidate.text.encode()).hexdigest(),
            "text": candidate.text,
            "language": request.language,
            "role": "rewrite" if candidate.stage != "original" else "ai_original",
            "sample_id": request.request_id,
            "pipeline": candidate.stage,
        }
        result = self.backend.detect(document)
        if result.get("status", "success") != "success":
            raise RuntimeError(
                f"Detector {self.detector_id} failed: {result.get('error')}"
            )
        return calibrated_detector_signal(
            self.detector_id,
            "generic",
            float(result["score"]),
            self.thresholds[request.language],
            self.operators[request.language],
            str(result.get("model_version") or "") or None,
        )

    @classmethod
    def from_calibration(
        cls,
        backend: GenericDetectorBackend,
        calibration: dict[str, Any],
    ) -> CalibratedGenericDetector:
        try:
            languages = calibration["detectors"][backend.detector_id]["languages"]
        except KeyError as error:
            raise ValueError(
                f"Calibration is missing detector {backend.detector_id}"
            ) from error
        if set(languages) != {"en", "it"}:
            raise ValueError("Detector calibration must contain en and it")
        return cls(
            backend=backend,
            thresholds={
                key: float(value["threshold"]) for key, value in languages.items()
            },
            operators={key: str(value["operator"]) for key, value in languages.items()},
        )


@dataclass(frozen=True)
class CompatibleTargetDetector:
    backend: TargetDetectorBackend
    thresholds: dict[str, dict[str, float]]
    operators: dict[str, str]

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "backend": self.backend.metadata,
            "thresholds": self.thresholds,
            "operators": self.operators,
            "compatibility_contract": "same-algorithm-config-tokenizer-and-key",
        }

    def evaluate(
        self,
        request: CascadeRequest,
        candidate: CascadeCandidate,
    ) -> DetectorSignal | None:
        if request.target_algorithm is None:
            return None
        algorithm = request.target_algorithm
        if algorithm not in self.thresholds:
            return None
        detection = self.backend.detect(algorithm, candidate.text)
        return calibrated_detector_signal(
            f"markllm_{algorithm.lower()}",
            "target",
            float(detection.score),
            self.thresholds[algorithm][request.language],
            self.operators.get(algorithm, "gt"),
            str(self.backend.metadata.get("model") or "") or None,
        )


class CompositeCascadeEvaluator:
    """Evaluate an entire cascade round before the selector observes any score."""

    def __init__(
        self,
        quality: QualityBackend,
        entity_extractor: EntityExtractor,
        generic_detectors: Sequence[CalibratedGenericDetector],
        judge: PairJudge | StructuredPairJudge | None,
        target_detector: CompatibleTargetDetector | None = None,
        max_workers: int = 4,
    ) -> None:
        if max_workers < 1:
            raise ValueError("max_workers must be positive")
        detector_ids = [value.detector_id for value in generic_detectors]
        if len(detector_ids) != len(set(detector_ids)):
            raise ValueError("Generic detector IDs must be unique")
        self.quality = quality
        self.entity_extractor = entity_extractor
        self.generic_detectors = tuple(generic_detectors)
        self.judge = judge
        self.target_detector = target_detector
        self.max_workers = max_workers

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "composite-cascade-evaluator-v1",
            "quality": self.quality.metadata,
            "entity_extractor": self.entity_extractor.metadata,
            "generic_detectors": [value.metadata for value in self.generic_detectors],
            "target_detector": (
                self.target_detector.metadata if self.target_detector else None
            ),
            "judge": self.judge.metadata if self.judge else None,
            "round_visibility": "all candidates evaluated before selection",
        }

    def evaluate_batch(
        self,
        request: CascadeRequest,
        candidates: Sequence[CascadeCandidate],
        protected_record: ProtectedSpanRecord,
    ) -> list[CandidateEvaluation]:
        if not candidates:
            return []
        neural = self.quality.evaluate_pairs(
            [(request.text, candidate.text) for candidate in candidates]
        )
        if len(neural) != len(candidates):
            raise RuntimeError("Quality backend returned an incomplete batch")

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            judge_futures = [
                executor.submit(self.judge.evaluate, request, candidate)
                if self.judge is not None
                else None
                for candidate in candidates
            ]
            entity_futures = [
                executor.submit(
                    self.entity_extractor.extract,
                    candidate.text,
                    request.language,
                )
                for candidate in candidates
            ]
            detector_futures = [
                [
                    executor.submit(detector.evaluate, request, candidate)
                    for detector in self.generic_detectors
                ]
                for candidate in candidates
            ]
            target_futures = [
                executor.submit(self.target_detector.evaluate, request, candidate)
                if self.target_detector is not None
                else None
                for candidate in candidates
            ]

            output = []
            for index, candidate in enumerate(candidates):
                candidate_entities = entity_futures[index].result()
                deterministic = deterministic_quality(
                    request.text,
                    candidate.text,
                    request.language,
                    protected_record=protected_record,
                    candidate_entities=candidate_entities,
                ).to_dict()
                signals = [future.result() for future in detector_futures[index]]
                target = (
                    target_futures[index].result()
                    if target_futures[index] is not None
                    else None
                )
                if target is not None:
                    signals.append(target)
                output.append(
                    CandidateEvaluation(
                        candidate=candidate,
                        deterministic_quality=deterministic,
                        semantic_similarity=float(neural[index].semantic_similarity),
                        bidirectional_entailment=float(
                            neural[index].bidirectional_entailment
                        ),
                        judge=(
                            judge_futures[index].result()
                            if judge_futures[index] is not None
                            else None
                        ),
                        detector_signals=tuple(signals),
                    )
                )
        return output
