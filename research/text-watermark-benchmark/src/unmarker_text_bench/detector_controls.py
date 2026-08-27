from __future__ import annotations

import hashlib
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from .generic_detectors import read_jsonl, sha256_text, utc_now, write_json, write_jsonl

DATASET_NAME = "wikimedia/wikipedia"
DATASET_REVISION = "b04c8d1ceb2f5cd4588862100d08de323dccfbaa"
CONFIGS = {"en": "20231101.en", "it": "20231101.it"}
EXCLUDED_TITLE_PREFIXES = {
    "en": ("List of ", "Category:", "Template:", "Wikipedia:"),
    "it": ("Lista di ", "Categoria:", "Template:", "Wikipedia:"),
}


class HumanControlCorpusBuilder:
    """Build matched, independent human controls from a pinned Wikipedia dump."""

    def run(
        self,
        benchmark_path: Path,
        output_path: Path,
        *,
        calibration_per_language: int = 1_000,
        evaluation_per_language: int = 500,
        seed: int = 20260827,
        shuffle_buffer: int = 20_000,
    ) -> dict[str, Any]:
        if calibration_per_language < 1 or evaluation_per_language < 1:
            raise ValueError("Both control splits must contain at least one document")
        benchmark = read_jsonl(benchmark_path)
        target_lengths: dict[str, list[int]] = defaultdict(list)
        excluded_ids: dict[str, set[str]] = defaultdict(set)
        for row in benchmark:
            language = str(row.get("language"))
            if language not in CONFIGS:
                continue
            target_lengths[language].append(
                int(row.get("word_count") or len(str(row["text"]).split()))
            )
            match = re.fullmatch(
                rf"wikipedia-{language}-(.+)", str(row.get("sample_id"))
            )
            if match:
                excluded_ids[language].add(match.group(1))
        for language in CONFIGS:
            if not target_lengths[language]:
                raise ValueError(f"Benchmark has no {language} documents")

        try:
            from datasets import load_dataset
        except ImportError as error:
            raise RuntimeError(
                "Install the markllm optional dependencies to build controls"
            ) from error

        requested = calibration_per_language + evaluation_per_language
        documents: list[dict[str, Any]] = []
        for language, config in CONFIGS.items():
            stream = load_dataset(
                DATASET_NAME,
                config,
                split="train",
                streaming=True,
                revision=DATASET_REVISION,
            ).shuffle(
                seed=seed + (0 if language == "en" else 1),
                buffer_size=shuffle_buffer,
            )
            selected = 0
            seen_ids: set[str] = set()
            for example in stream:
                article_id = str(example.get("id", ""))
                if (
                    not article_id
                    or article_id in seen_ids
                    or article_id in excluded_ids[language]
                    or not self._usable(example, language)
                ):
                    continue
                target = target_lengths[language][
                    selected % len(target_lengths[language])
                ]
                text = self._matched_text(str(example["text"]), target)
                if len(text) < 255:
                    continue
                seen_ids.add(article_id)
                split = (
                    "calibration"
                    if selected < calibration_per_language
                    else "evaluation"
                )
                documents.append(self._document(example, language, config, split, text))
                selected += 1
                if selected == requested:
                    break
            if selected != requested:
                raise RuntimeError(
                    f"Only found {selected}/{requested} independent {language} controls"
                )

        write_jsonl(output_path, documents)
        counts = Counter(
            (str(row["language"]), str(row["control_split"])) for row in documents
        )
        manifest = {
            "artifact_schema_version": 1,
            "artifact_kind": "unmarker-generic-detector-human-controls",
            "created_at": utc_now(),
            "dataset": DATASET_NAME,
            "dataset_revision": DATASET_REVISION,
            "dataset_configs": CONFIGS,
            "seed": seed,
            "shuffle_buffer": shuffle_buffer,
            "benchmark_path": str(benchmark_path),
            "benchmark_sha256": hashlib.sha256(benchmark_path.read_bytes()).hexdigest(),
            "excluded_benchmark_article_ids": {
                language: sorted(ids) for language, ids in excluded_ids.items()
            },
            "documents_path": str(output_path),
            "documents_sha256": hashlib.sha256(output_path.read_bytes()).hexdigest(),
            "document_count": len(documents),
            "counts": {
                f"{language}:{split}": count
                for (language, split), count in sorted(counts.items())
            },
            "word_length": {
                language: {
                    "minimum": min(
                        row["word_count"]
                        for row in documents
                        if row["language"] == language
                    ),
                    "median": statistics.median(
                        row["word_count"]
                        for row in documents
                        if row["language"] == language
                    ),
                    "maximum": max(
                        row["word_count"]
                        for row in documents
                        if row["language"] == language
                    ),
                }
                for language in CONFIGS
            },
            "control_contract": (
                "pinned-wikipedia-independent-article-length-matched-split-v1"
            ),
            "limitations": [
                "The pinned 2023 Wikipedia snapshot is not guaranteed free of AI-assisted edits.",
                "Controls are encyclopedic and do not estimate FPR on every product domain.",
            ],
        }
        write_json(output_path.parent / "controls-manifest.json", manifest)
        return manifest

    @staticmethod
    def _usable(example: dict[str, Any], language: str) -> bool:
        title = str(example.get("title", "")).strip()
        text = str(example.get("text", ""))
        return (
            4 <= len(title) <= 120
            and not title.startswith(EXCLUDED_TITLE_PREFIXES[language])
            and len(text.split()) >= 180
        )

    @staticmethod
    def _matched_text(text: str, target_words: int) -> str:
        normalized = re.sub(r"\s+", " ", text).strip()
        words = normalized.split()
        return " ".join(words[: max(100, target_words)])

    @staticmethod
    def _document(
        example: dict[str, Any],
        language: str,
        config: str,
        split: str,
        text: str,
    ) -> dict[str, Any]:
        article_id = str(example["id"])
        return {
            "artifact_schema_version": 1,
            "artifact_kind": "generic-detector-document",
            "document_id": f"human:{split}:{language}:wikipedia-{article_id}",
            "text_sha256": sha256_text(text),
            "text": text,
            "character_count": len(text),
            "word_count": len(text.split()),
            "role": "human_control",
            "control_split": split,
            "language": language,
            "sample_id": f"wikipedia-{language}-{article_id}",
            "pipeline": "human_control",
            "candidate_key": None,
            "algorithm": None,
            "domain": "encyclopedic",
            "quality_pass": None,
            "changed_token_ratio": None,
            "gate2b_target_detected": None,
            "source": {
                "dataset": DATASET_NAME,
                "config": config,
                "revision": DATASET_REVISION,
                "article_id": article_id,
                "title": str(example.get("title", "")),
                "url": str(example.get("url", "")),
            },
        }
