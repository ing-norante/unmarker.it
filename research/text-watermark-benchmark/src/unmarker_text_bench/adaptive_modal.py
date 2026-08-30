from __future__ import annotations

from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from typing import Any

from .adaptive_cascade import (
    CandidateEvaluation,
    CascadeCandidate,
    CascadeEvaluator,
    CascadeRequest,
    JudgeSignals,
    StructuredPairJudge,
    calibrated_detector_signal,
)
from .protected_spans import EntitySpan, ProtectedSpanRecord
from .self_information import TokenSurprisal

ModalInvoker = Callable[[str, str, tuple[Any, ...]], dict[str, Any]]


def invoke_deployed_modal(
    app_name: str,
    function_name: str,
    arguments: tuple[Any, ...],
) -> dict[str, Any]:
    try:
        import modal
    except ImportError as error:
        raise RuntimeError(
            "Adaptive Modal execution requires the benchmark modal extra"
        ) from error
    function = modal.Function.from_name(app_name, function_name)
    return function.remote(*arguments)


class ModalEntityExtractor:
    def __init__(
        self,
        thresholds: dict[str, float],
        labels: tuple[str, ...],
        invoker: ModalInvoker = invoke_deployed_modal,
    ) -> None:
        self.thresholds = thresholds
        self.labels = labels
        self.invoker = invoker

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "deployed-modal-gliner",
            "app": "unmarker-markllm-benchmark",
            "function": "adaptive_extract_entities",
            "thresholds": self.thresholds,
            "labels": list(self.labels),
        }

    def extract(self, text: str, language: str) -> list[EntitySpan]:
        payload = self.invoker(
            "unmarker-markllm-benchmark",
            "adaptive_extract_entities",
            (text, language, self.thresholds, self.labels),
        )
        return [EntitySpan.from_dict(value) for value in payload["entities"]]


class ModalSelfInformationScorer:
    def __init__(self, invoker: ModalInvoker = invoke_deployed_modal) -> None:
        self.invoker = invoker
        self._metadata: dict[str, Any] = {
            "implementation": "deployed-modal-self-information",
            "app": "unmarker-markllm-benchmark",
            "function": "adaptive_self_information",
        }

    @property
    def metadata(self) -> dict[str, Any]:
        return self._metadata

    def score(self, text: str) -> list[TokenSurprisal]:
        payload = self.invoker(
            "unmarker-markllm-benchmark",
            "adaptive_self_information",
            (text,),
        )
        self._metadata = {**self._metadata, "scorer": payload.get("scorer")}
        return [TokenSurprisal(**value) for value in payload["tokens"]]


class ModalCascadeEvaluator(CascadeEvaluator):
    """Fan out one candidate round to the deployed Modal model services."""

    def __init__(
        self,
        calibration: dict[str, Any],
        gliner_thresholds: dict[str, float],
        gliner_labels: tuple[str, ...],
        judge: StructuredPairJudge | None,
        detectors: tuple[str, ...] = (
            "binoculars",
            "fast_detect_gpt",
            "logrank",
            "radar",
        ),
        target_thresholds: dict[str, dict[str, float]] | None = None,
        target_operators: dict[str, str] | None = None,
        invoker: ModalInvoker = invoke_deployed_modal,
        max_workers: int = 8,
    ) -> None:
        supported = {"binoculars", "fast_detect_gpt", "logrank", "radar"}
        unknown = sorted(set(detectors) - supported)
        if unknown:
            raise ValueError(f"Unsupported adaptive detectors: {unknown}")
        calibrated = set(calibration.get("detectors", {}))
        missing = sorted(set(detectors) - calibrated)
        if missing:
            raise ValueError(f"Calibration is missing detectors: {missing}")
        if set(gliner_thresholds) != {"en", "it"}:
            raise ValueError("GLiNER thresholds must contain en and it")
        self.calibration = calibration
        self.gliner_thresholds = gliner_thresholds
        self.gliner_labels = gliner_labels
        self.judge = judge
        self.detectors = detectors
        self.target_thresholds = target_thresholds or {}
        self.target_operators = target_operators or {}
        self.invoker = invoker
        self.max_workers = max_workers

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "modal-adaptive-ensemble-v1",
            "detectors": list(self.detectors),
            "calibration_artifact_kind": self.calibration.get("artifact_kind"),
            "gliner_thresholds": self.gliner_thresholds,
            "gliner_labels": list(self.gliner_labels),
            "judge": self.judge.metadata if self.judge else None,
            "target_algorithms": sorted(self.target_thresholds),
            "round_visibility": "all remote results joined before selection",
        }

    def evaluate_batch(
        self,
        request: CascadeRequest,
        candidates: Sequence[CascadeCandidate],
        protected_record: ProtectedSpanRecord,
    ) -> list[CandidateEvaluation]:
        documents = [
            {
                "candidate_id": candidate.candidate_id,
                "text": candidate.text,
                "stage": candidate.stage,
            }
            for candidate in candidates
        ]
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            quality_future = executor.submit(
                self.invoker,
                "unmarker-markllm-benchmark",
                "adaptive_quality_batch",
                (
                    request.text,
                    request.language,
                    documents,
                    [asdict(value) for value in protected_record.entities],
                    request.terminology,
                    self.gliner_thresholds,
                    self.gliner_labels,
                ),
            )
            detector_futures: dict[str, Any] = {}
            if "binoculars" in self.detectors:
                detector_futures["binoculars"] = executor.submit(
                    self.invoker,
                    "unmarker-generic-binoculars",
                    "adaptive_binoculars_batch",
                    (documents,),
                )
            if {"fast_detect_gpt", "logrank"} & set(self.detectors):
                detector_futures["fast_and_logrank"] = executor.submit(
                    self.invoker,
                    "unmarker-fast-detect-gpt",
                    "adaptive_fast_detect_batch",
                    (documents,),
                )
            if "radar" in self.detectors:
                detector_futures["radar"] = executor.submit(
                    self.invoker,
                    "unmarker-open-text-detectors",
                    "adaptive_radar_batch",
                    (documents,),
                )
            target_future = None
            if (
                request.target_algorithm is not None
                and request.target_algorithm in self.target_thresholds
            ):
                target_future = executor.submit(
                    self.invoker,
                    "unmarker-markllm-benchmark",
                    "adaptive_target_batch",
                    (request.target_algorithm, documents),
                )
            judge_futures = [
                executor.submit(self.judge.evaluate, request, candidate)
                if self.judge is not None
                else None
                for candidate in candidates
            ]

            quality_payload = quality_future.result()
            remote_payloads = {
                key: future.result() for key, future in detector_futures.items()
            }
            target_payload = target_future.result() if target_future else None
            judge_values: list[JudgeSignals | None] = [
                future.result() if future is not None else None
                for future in judge_futures
            ]

        quality_by_id = _rows_by_id(quality_payload["rows"])
        detector_rows: dict[str, dict[str, dict[str, Any]]] = {}
        if "binoculars" in remote_payloads:
            detector_rows["binoculars"] = _rows_by_id(
                remote_payloads["binoculars"]["rows"]
            )
        if "fast_and_logrank" in remote_payloads:
            for detector_id, payload in remote_payloads["fast_and_logrank"][
                "detectors"
            ].items():
                if detector_id in self.detectors:
                    detector_rows[detector_id] = _rows_by_id(payload["rows"])
        if "radar" in remote_payloads:
            detector_rows["radar"] = _rows_by_id(remote_payloads["radar"]["rows"])
        target_by_id = _rows_by_id(target_payload["rows"]) if target_payload else {}

        output = []
        for index, candidate in enumerate(candidates):
            candidate_id = candidate.candidate_id
            quality = quality_by_id[candidate_id]
            signals = []
            for detector_id in self.detectors:
                calibration = self.calibration["detectors"][detector_id]["languages"][
                    request.language
                ]
                row = detector_rows[detector_id][candidate_id]
                signals.append(
                    calibrated_detector_signal(
                        detector_id,
                        "generic",
                        float(row["score"]),
                        float(calibration["threshold"]),
                        str(calibration["operator"]),
                        str(row.get("model_version") or "") or None,
                    )
                )
            if target_payload is not None and request.target_algorithm is not None:
                target_row = target_by_id[candidate_id]
                algorithm = request.target_algorithm
                signals.append(
                    calibrated_detector_signal(
                        f"markllm_{algorithm.lower()}",
                        "target",
                        float(target_row["score"]),
                        self.target_thresholds[algorithm][request.language],
                        self.target_operators.get(algorithm, "gt"),
                        str(target_payload.get("detector", {}).get("model") or "")
                        or None,
                    )
                )
            output.append(
                CandidateEvaluation(
                    candidate=candidate,
                    deterministic_quality=quality["deterministic_quality"],
                    semantic_similarity=float(quality["semantic_similarity"]),
                    bidirectional_entailment=float(quality["bidirectional_entailment"]),
                    judge=judge_values[index],
                    detector_signals=tuple(signals),
                )
            )
        return output


def _rows_by_id(rows: Sequence[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    indexed = {str(value["candidate_id"]): value for value in rows}
    if len(indexed) != len(rows):
        raise ValueError("Modal adaptive response contains duplicate candidate IDs")
    return indexed
