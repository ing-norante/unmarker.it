from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .markllm_gate import DetectionResult


@dataclass(frozen=True)
class NeuralQualityResult:
    semantic_similarity: float
    entailment_original_to_candidate: float
    entailment_candidate_to_original: float

    @property
    def bidirectional_entailment(self) -> float:
        return min(
            self.entailment_original_to_candidate,
            self.entailment_candidate_to_original,
        )


class QualityBackend(Protocol):
    @property
    def metadata(self) -> dict[str, Any]: ...

    def evaluate_pairs(
        self, pairs: list[tuple[str, str]]
    ) -> list[NeuralQualityResult]: ...


class DetectorBackend(Protocol):
    @property
    def metadata(self) -> dict[str, Any]: ...

    def detect(self, algorithm: str, text: str) -> DetectionResult: ...


class NeuralQualityEvaluator:
    """Multilingual embedding similarity plus bidirectional multilingual NLI."""

    def __init__(
        self,
        embedding_model: str,
        embedding_revision: str | None,
        nli_model: str,
        nli_revision: str | None,
        device: str = "cuda",
        batch_size: int = 32,
    ) -> None:
        try:
            import torch
            from sentence_transformers import SentenceTransformer
            from transformers import AutoModelForSequenceClassification, AutoTokenizer
        except ImportError as error:
            raise RuntimeError(
                "Neural quality evaluation requires torch, transformers, and sentence-transformers"
            ) from error
        self.torch = torch
        self.embedding_model_name = embedding_model
        self.embedding_revision = embedding_revision
        self.nli_model_name = nli_model
        self.nli_revision = nli_revision
        self.device = device
        self.batch_size = batch_size
        self.embedding_model = SentenceTransformer(
            embedding_model,
            revision=embedding_revision,
            device=device,
        )
        self.nli_tokenizer = AutoTokenizer.from_pretrained(
            nli_model,
            revision=nli_revision,
            use_fast=True,
        )
        self.nli_model = AutoModelForSequenceClassification.from_pretrained(
            nli_model,
            revision=nli_revision,
        ).to(device)
        self.nli_model.eval()
        labels = {
            int(index): str(label).lower()
            for index, label in self.nli_model.config.id2label.items()
        }
        matches = [index for index, label in labels.items() if "entail" in label]
        if not matches:
            raise ValueError(
                f"Could not find entailment label in NLI model labels: {labels}"
            )
        self.entailment_index = matches[0]

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "multilingual_embedding_and_bidirectional_nli",
            "embedding_model": self.embedding_model_name,
            "embedding_revision": self.embedding_revision,
            "nli_model": self.nli_model_name,
            "nli_revision": self.nli_revision,
            "device": self.device,
            "batch_size": self.batch_size,
            "nli_max_length": 512,
        }

    def evaluate_pairs(self, pairs: list[tuple[str, str]]) -> list[NeuralQualityResult]:
        if not pairs:
            return []
        flattened = [text for pair in pairs for text in pair]
        embeddings = self.embedding_model.encode(
            flattened,
            batch_size=self.batch_size,
            convert_to_tensor=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        similarities = [
            float((embeddings[index] * embeddings[index + 1]).sum().item())
            for index in range(0, len(flattened), 2)
        ]
        forward = self._entailment(pairs)
        backward = self._entailment([(right, left) for left, right in pairs])
        return [
            NeuralQualityResult(similarity, forward_score, backward_score)
            for similarity, forward_score, backward_score in zip(
                similarities, forward, backward
            )
        ]

    def _entailment(self, pairs: list[tuple[str, str]]) -> list[float]:
        results: list[float] = []
        for offset in range(0, len(pairs), self.batch_size):
            batch = pairs[offset : offset + self.batch_size]
            encoded = self.nli_tokenizer(
                [left for left, _ in batch],
                [right for _, right in batch],
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            ).to(self.device)
            with self.torch.inference_mode():
                logits = self.nli_model(**encoded).logits.float()
                probabilities = self.torch.softmax(logits, dim=-1)
            results.extend(
                float(value)
                for value in probabilities[:, self.entailment_index]
                .detach()
                .cpu()
                .tolist()
            )
        return results


class CandidateEvaluationRunner:
    ARTIFACT_SCHEMA_VERSION = 2

    def __init__(
        self,
        detector: DetectorBackend,
        quality: QualityBackend,
        semantic_threshold: float = 0.90,
        nli_threshold: float = 0.80,
        batch_size: int = 32,
    ) -> None:
        self.detector = detector
        self.quality = quality
        self.semantic_threshold = semantic_threshold
        self.nli_threshold = nli_threshold
        self.batch_size = batch_size

    def run(
        self,
        generations_path: Path,
        candidates_path: Path,
        output_path: Path,
        resume: bool = True,
        checkpoint: Callable[[], None] | None = None,
        checkpoint_every: int = 64,
    ) -> dict[str, Any]:
        generations = _read_jsonl(generations_path)
        candidates = _read_jsonl(candidates_path)
        manifest = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "generations_sha256": hashlib.sha256(
                generations_path.read_bytes()
            ).hexdigest(),
            "candidates_sha256": hashlib.sha256(
                candidates_path.read_bytes()
            ).hexdigest(),
            "quality": self.quality.metadata,
            "detector": self.detector.metadata,
            "semantic_threshold": self.semantic_threshold,
            "nli_threshold": self.nli_threshold,
        }
        manifest_path = output_path.with_suffix(".manifest.json")
        if resume and output_path.exists():
            if (
                not manifest_path.exists()
                or json.loads(manifest_path.read_text(encoding="utf-8")) != manifest
            ):
                raise ValueError(
                    "Cannot resume evaluation with different inputs or configuration"
                )
            existing = _read_jsonl(output_path)
        else:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text("", encoding="utf-8")
            existing = []
        _write_json(manifest_path, manifest)

        generation_by_case = {
            f"{row['sample_id']}|{row['algorithm']}": row
            for row in generations
            if row["split"] == "evaluation"
        }
        completed = {row["candidate_key"]: row for row in existing}
        pending = [row for row in candidates if row["candidate_key"] not in completed]
        for offset in range(0, len(pending), self.batch_size):
            batch = pending[offset : offset + self.batch_size]
            neural = self.quality.evaluate_pairs(
                [(row["original_text"], row["candidate_text"]) for row in batch]
            )
            for candidate, quality in zip(batch, neural):
                generation = generation_by_case[candidate["case_key"]]
                detection = self.detector.detect(
                    candidate["algorithm"], candidate["candidate_text"]
                )
                threshold = float(generation["calibrated_threshold_1pct"])
                deterministic_pass = bool(candidate["deterministic_quality"]["passes"])
                quality_pass = (
                    deterministic_pass
                    and quality.semantic_similarity >= self.semantic_threshold
                    and quality.bidirectional_entailment >= self.nli_threshold
                )
                source_kind = candidate.get("source_kind", "watermarked")
                if source_kind == "clean":
                    preattack_score = generation["unwatermarked_score"]
                    preattack_detected = generation["calibrated_unwatermarked_detected"]
                elif source_kind == "watermarked":
                    preattack_score = generation["watermarked_score"]
                    preattack_detected = generation["calibrated_watermarked_detected"]
                else:
                    raise ValueError(f"Unknown candidate source_kind: {source_kind}")
                row = {
                    "candidate_key": candidate["candidate_key"],
                    "case_key": candidate["case_key"],
                    "sample_id": candidate["sample_id"],
                    "language": candidate["language"],
                    "algorithm": candidate["algorithm"],
                    "pipeline": candidate["pipeline"],
                    "budget": candidate["budget"],
                    "artifact_kind": candidate.get(
                        "artifact_kind", "candidate_algorithm"
                    ),
                    "source_kind": source_kind,
                    "attempt": candidate.get("attempt"),
                    "attack_split": candidate["attack_split"],
                    "target_score": detection.score,
                    "target_threshold_at_1pct_fpr": threshold,
                    "target_detected": detection.score > threshold,
                    "target_builtin_detected": detection.detected,
                    "preattack_score": preattack_score,
                    "preattack_detected": preattack_detected,
                    "semantic_similarity": quality.semantic_similarity,
                    "entailment_original_to_candidate": (
                        quality.entailment_original_to_candidate
                    ),
                    "entailment_candidate_to_original": (
                        quality.entailment_candidate_to_original
                    ),
                    "bidirectional_entailment": quality.bidirectional_entailment,
                    "deterministic_quality_pass": deterministic_pass,
                    "quality_pass": quality_pass,
                }
                completed[row["candidate_key"]] = row
                _append_jsonl(output_path, row)
                if checkpoint and len(completed) % checkpoint_every == 0:
                    checkpoint()

        ordered = [completed[row["candidate_key"]] for row in candidates]
        _write_jsonl(output_path, ordered)
        if checkpoint:
            checkpoint()
        return {
            "candidates": len(ordered),
            "artifact_breakdown": _counts(
                row.get("artifact_kind", "candidate_algorithm") for row in ordered
            ),
            "quality_pass_rate": _mean(bool(row["quality_pass"]) for row in ordered),
            "postattack_target_tpr": _mean(
                bool(row["target_detected"]) for row in ordered
            ),
            "quality": self.quality.metadata,
        }


def _mean(values: Any) -> float:
    items = [float(value) for value in values]
    return sum(items) / len(items) if items else 0.0


def _counts(values: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        counts[str(value)] = counts.get(str(value), 0) + 1
    return dict(sorted(counts.items()))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}") from error
    return rows


def _append_jsonl(path: Path, row: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False) + "\n")
        handle.flush()


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
