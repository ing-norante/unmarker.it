from __future__ import annotations

import hashlib
import json
import math
import time
from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from statistics import mean
from typing import Any, Protocol


@dataclass(frozen=True)
class PromptSample:
    id: str
    language: str
    domain: str
    split: str
    prompt: str
    source: dict[str, Any] | None = None


@dataclass(frozen=True)
class DetectionResult:
    detected: bool
    score: float


class MarkLLMGenerationBackend(Protocol):
    @property
    def metadata(self) -> dict[str, Any]: ...

    def generate_unwatermarked(self, prompt: str, seed: int) -> str: ...

    def generate_watermarked(self, algorithm: str, prompt: str, seed: int) -> str: ...

    def detect(self, algorithm: str, text: str) -> DetectionResult: ...

    def count_tokens(self, text: str) -> int: ...


@dataclass(frozen=True)
class Gate2Config:
    algorithms: tuple[str, ...] = ("KGW", "Unigram", "SynthID")
    target_fpr: float = 0.01
    min_calibration_prompts_per_language: int = 100
    min_evaluation_prompts_per_language: int = 100
    min_generated_tokens: int = 80
    seed: int = 20260819
    allow_small_smoke: bool = False


def load_prompts(path: Path) -> list[PromptSample]:
    prompts: list[PromptSample] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            payload = json.loads(line)
            try:
                prompt = PromptSample(
                    id=str(payload["id"]),
                    language=str(payload["language"]),
                    domain=str(payload["domain"]),
                    split=str(payload["split"]),
                    prompt=str(payload["prompt"]).strip(),
                    source=payload.get("source"),
                )
            except KeyError as error:
                raise ValueError(
                    f"Missing {error.args[0]!r} at {path}:{line_number}"
                ) from error
            prompts.append(prompt)
    if not prompts:
        raise ValueError(f"Prompt dataset is empty: {path}")
    return prompts


class MarkLLMGateRunner:
    ARTIFACT_SCHEMA_VERSION = 2

    def __init__(
        self,
        prompts: list[PromptSample],
        backend: MarkLLMGenerationBackend,
        config: Gate2Config | None = None,
    ) -> None:
        self.prompts = prompts
        self.backend = backend
        self.config = config or Gate2Config()
        self._validate_prompts()

    def _validate_prompts(self) -> None:
        if not self.config.algorithms:
            raise ValueError("At least one MarkLLM algorithm is required")
        if not 0.0 < self.config.target_fpr < 1.0:
            raise ValueError("target_fpr must be between 0 and 1")

        ids = [prompt.id for prompt in self.prompts]
        if len(ids) != len(set(ids)):
            duplicates = sorted(
                identifier for identifier, count in Counter(ids).items() if count > 1
            )
            raise ValueError(f"Prompt ids must be unique; duplicates: {duplicates[:5]}")

        normalized = [
            " ".join(prompt.prompt.lower().split()) for prompt in self.prompts
        ]
        if len(normalized) != len(set(normalized)):
            raise ValueError(
                "Prompt texts must be unique after whitespace/case normalization"
            )

        invalid_languages = sorted(
            {prompt.language for prompt in self.prompts} - {"en", "it"}
        )
        if invalid_languages:
            raise ValueError(f"Unsupported prompt languages: {invalid_languages}")

        invalid_splits = sorted(
            {prompt.split for prompt in self.prompts} - {"calibration", "evaluation"}
        )
        if invalid_splits:
            raise ValueError(f"Unsupported prompt splits: {invalid_splits}")

        short = [prompt.id for prompt in self.prompts if len(prompt.prompt) < 20]
        if short:
            raise ValueError(
                f"Prompts must contain at least 20 characters: {short[:5]}"
            )

        split_counts = Counter(
            (prompt.language, prompt.split) for prompt in self.prompts
        )
        required = {
            (language, "calibration"): self.config.min_calibration_prompts_per_language
            for language in ("en", "it")
        } | {
            (language, "evaluation"): self.config.min_evaluation_prompts_per_language
            for language in ("en", "it")
        }
        underfilled = {
            f"{language}/{split}": split_counts[(language, split)]
            for (language, split), minimum in required.items()
            if split_counts[(language, split)] < minimum
        }
        missing_cells = [cell for cell in required if split_counts[cell] == 0]
        if missing_cells:
            raise ValueError(
                f"Every language/split cell needs at least one prompt: {missing_cells}"
            )
        if underfilled and not self.config.allow_small_smoke:
            raise ValueError(
                "Gate 2 requires independent calibration and evaluation prompts; "
                f"minimums={required}, counts={dict(sorted(split_counts.items()))}. "
                "Use allow_small_smoke only for integration tests."
            )

    def run(
        self,
        output_dir: Path,
        resume: bool = True,
        checkpoint: Callable[[], None] | None = None,
        checkpoint_every: int = 10,
    ) -> dict[str, Any]:
        output_dir.mkdir(parents=True, exist_ok=True)
        raw_path = output_dir / "raw-generations.jsonl"
        manifest_path = output_dir / "input-manifest.json"
        manifest = self._input_manifest()
        if resume and raw_path.exists():
            if not manifest_path.exists():
                raise ValueError(
                    f"Cannot safely resume {raw_path}: input-manifest.json is missing"
                )
            previous_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if previous_manifest != manifest:
                raise ValueError(
                    "Cannot resume: prompts or generation configuration differ from the "
                    "existing input-manifest.json. Use a new output directory or --no-resume."
                )
        else:
            raw_path.write_text("", encoding="utf-8")
        self._write_json(manifest_path, manifest)
        existing = self._load_raw_records(raw_path) if resume else {}
        records_by_key = dict(existing)

        for prompt in self.prompts:
            seed = self._sample_seed(prompt.id)
            expected_keys = [
                (prompt.id, algorithm) for algorithm in self.config.algorithms
            ]
            if all(key in records_by_key for key in expected_keys):
                continue

            previous = next(
                (records_by_key[key] for key in expected_keys if key in records_by_key),
                None,
            )
            if previous is None:
                start = time.perf_counter()
                unwatermarked = self.backend.generate_unwatermarked(prompt.prompt, seed)
                unwatermarked_latency_ms = (time.perf_counter() - start) * 1000
            else:
                unwatermarked = previous["unwatermarked_text"]
                unwatermarked_latency_ms = previous["unwatermarked_latency_ms"]

            for algorithm in self.config.algorithms:
                key = (prompt.id, algorithm)
                if key in records_by_key:
                    continue
                unwatermarked_detection = self.backend.detect(algorithm, unwatermarked)
                unwatermarked_tokens = self.backend.count_tokens(unwatermarked)
                watermarked: str | None = None
                watermarked_detection: DetectionResult | None = None
                watermarked_tokens: int | None = None
                watermarked_latency_ms: float | None = None
                if prompt.split == "evaluation":
                    start = time.perf_counter()
                    watermarked = self.backend.generate_watermarked(
                        algorithm, prompt.prompt, seed
                    )
                    watermarked_latency_ms = (time.perf_counter() - start) * 1000
                    watermarked_detection = self.backend.detect(algorithm, watermarked)
                    watermarked_tokens = self.backend.count_tokens(watermarked)
                record = {
                    "sample_id": prompt.id,
                    "language": prompt.language,
                    "domain": prompt.domain,
                    "split": prompt.split,
                    "algorithm": algorithm,
                    "seed": seed,
                    "prompt": prompt.prompt,
                    "source": prompt.source,
                    "unwatermarked_text": unwatermarked,
                    "watermarked_text": watermarked,
                    "unwatermarked_score": unwatermarked_detection.score,
                    "watermarked_score": (
                        watermarked_detection.score if watermarked_detection else None
                    ),
                    "markllm_unwatermarked_detected": unwatermarked_detection.detected,
                    "markllm_watermarked_detected": (
                        watermarked_detection.detected
                        if watermarked_detection
                        else None
                    ),
                    "unwatermarked_tokens": unwatermarked_tokens,
                    "watermarked_tokens": watermarked_tokens,
                    "unwatermarked_length_pass": (
                        unwatermarked_tokens >= self.config.min_generated_tokens
                    ),
                    "watermarked_length_pass": (
                        watermarked_tokens >= self.config.min_generated_tokens
                        if watermarked_tokens is not None
                        else None
                    ),
                    "unwatermarked_latency_ms": unwatermarked_latency_ms,
                    "watermarked_latency_ms": watermarked_latency_ms,
                }
                records_by_key[key] = record
                self._append_jsonl(raw_path, record)
                if checkpoint and len(records_by_key) % checkpoint_every == 0:
                    checkpoint()

        records = [
            records_by_key[(prompt.id, algorithm)]
            for prompt in self.prompts
            for algorithm in self.config.algorithms
        ]

        thresholds = self._calibrate_thresholds(records)
        for record in records:
            threshold = thresholds[record["algorithm"]][record["language"]]
            record["calibrated_threshold_1pct"] = threshold
            record["calibrated_unwatermarked_detected"] = (
                record["unwatermarked_score"] > threshold
            )
            record["calibrated_watermarked_detected"] = (
                record["watermarked_score"] > threshold
                if record["watermarked_score"] is not None
                else None
            )

        summary = self._summarize(records, thresholds)
        self._write_jsonl(output_dir / "generations.jsonl", records)
        self._write_json(output_dir / "summary.json", summary)
        self._write_json(
            output_dir / "config.json",
            {
                "gate": asdict(self.config),
                "backend": self.backend.metadata,
                "resume_enabled": resume,
                "raw_record_count": len(records),
            },
        )
        if checkpoint:
            checkpoint()
        return summary

    def _input_manifest(self) -> dict[str, Any]:
        prompt_payload = [asdict(prompt) for prompt in self.prompts]
        prompt_bytes = json.dumps(
            prompt_payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        backend = self.backend.metadata
        stable_backend_keys = (
            "implementation",
            "source_commit",
            "model",
            "model_revision",
            "vocab_size",
            "tokenizer_length",
            "max_new_tokens",
            "min_new_tokens",
            "temperature",
            "top_p",
            "top_k",
            "use_chat_template",
            "enable_thinking",
            "algorithm_config_sha256",
        )
        manifest = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "prompts_sha256": hashlib.sha256(prompt_bytes).hexdigest(),
            "prompt_count": len(prompt_payload),
            "gate": asdict(self.config),
            "backend": {
                key: backend.get(key) for key in stable_backend_keys if key in backend
            },
        }
        # Normalize tuples and other JSON-compatible containers so an in-memory
        # manifest compares equal to the same manifest loaded from disk.
        return json.loads(json.dumps(manifest, ensure_ascii=False))

    def _load_raw_records(self, path: Path) -> dict[tuple[str, str], dict[str, Any]]:
        if not path.exists():
            return {}
        valid_ids = {prompt.id for prompt in self.prompts}
        records: dict[tuple[str, str], dict[str, Any]] = {}
        with path.open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                    key = (str(record["sample_id"]), str(record["algorithm"]))
                except (json.JSONDecodeError, KeyError) as error:
                    raise ValueError(
                        f"Invalid resume record at {path}:{line_number}"
                    ) from error
                if key[0] not in valid_ids or key[1] not in self.config.algorithms:
                    raise ValueError(
                        f"Resume artifact contains an unexpected key: {key}"
                    )
                records[key] = record
        return records

    def _calibrate_thresholds(
        self, records: list[dict[str, Any]]
    ) -> dict[str, dict[str, float]]:
        scores: dict[tuple[str, str], list[float]] = defaultdict(list)
        for record in records:
            if record["split"] != "calibration":
                continue
            scores[(record["algorithm"], record["language"])].append(
                float(record["unwatermarked_score"])
            )
        thresholds: dict[str, dict[str, float]] = defaultdict(dict)
        for (algorithm, language), values in sorted(scores.items()):
            ordered = sorted(values)
            index = min(
                len(ordered) - 1,
                max(0, math.ceil((1.0 - self.config.target_fpr) * len(ordered)) - 1),
            )
            thresholds[algorithm][language] = ordered[index]
        return dict(thresholds)

    def _summarize(
        self,
        records: list[dict[str, Any]],
        thresholds: dict[str, dict[str, float]],
    ) -> dict[str, Any]:
        groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for record in records:
            if record["split"] != "evaluation":
                continue
            groups[(record["algorithm"], record["language"])].append(record)

        cells = []
        for (algorithm, language), items in sorted(groups.items()):
            cells.append(
                {
                    "algorithm": algorithm,
                    "language": language,
                    "samples": len(items),
                    "threshold_at_target_fpr": thresholds[algorithm][language],
                    "empirical_unwatermarked_fpr": mean(
                        float(item["calibrated_unwatermarked_detected"])
                        for item in items
                    ),
                    "watermarked_tpr_at_calibrated_threshold": mean(
                        float(item["calibrated_watermarked_detected"]) for item in items
                    ),
                    "markllm_builtin_watermarked_tpr": mean(
                        float(item["markllm_watermarked_detected"]) for item in items
                    ),
                    "unwatermarked_length_pass_rate": mean(
                        float(item["unwatermarked_length_pass"]) for item in items
                    ),
                    "watermarked_length_pass_rate": mean(
                        float(item["watermarked_length_pass"]) for item in items
                    ),
                    "mean_unwatermarked_tokens": mean(
                        item["unwatermarked_tokens"] for item in items
                    ),
                    "mean_watermarked_tokens": mean(
                        item["watermarked_tokens"] for item in items
                    ),
                    "mean_unwatermarked_latency_ms": mean(
                        item["unwatermarked_latency_ms"] for item in items
                    ),
                    "mean_watermarked_latency_ms": mean(
                        item["watermarked_latency_ms"] for item in items
                    ),
                }
            )

        language_counts = Counter(prompt.language for prompt in self.prompts)
        split_counts = Counter(
            (prompt.language, prompt.split) for prompt in self.prompts
        )
        return {
            "benchmark_scope": "official_markllm_generation_and_detection",
            "evidence_status": "gate_2_corpus_baseline_only_no_attack_claim",
            "target_fpr": self.config.target_fpr,
            "source_prompt_count": len(self.prompts),
            "source_prompts_by_language": dict(sorted(language_counts.items())),
            "source_prompts_by_language_split": {
                f"{language}/{split}": count
                for (language, split), count in sorted(split_counts.items())
            },
            "prompts_are_unique": True,
            "circular_composition": False,
            "lexicon_used_for_generation": False,
            "algorithms": list(self.config.algorithms),
            "backend": self.backend.metadata,
            "cells": cells,
            "warning": (
                "This artifact validates MarkLLM generation/detection and corpus adequacy only. "
                "It contains no evidence that a rewrite attack removes a production watermark."
            ),
        }

    def _sample_seed(self, sample_id: str) -> int:
        digest = hashlib.blake2b(
            f"{self.config.seed}|{sample_id}".encode(),
            digest_size=4,
        ).digest()
        return int.from_bytes(digest, "big")

    @staticmethod
    def _write_json(path: Path, payload: Any) -> None:
        path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    @staticmethod
    def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
        with path.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    @staticmethod
    def _append_jsonl(path: Path, row: dict[str, Any]) -> None:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
            handle.flush()
