from __future__ import annotations

import hashlib
import re
import statistics
from collections import Counter, defaultdict
from itertools import pairwise
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
        italian_book_dir: Path | None = None,
        book_excerpts_per_chapter: int = 3,
    ) -> dict[str, Any]:
        if calibration_per_language < 1 or evaluation_per_language < 1:
            raise ValueError("Both control splits must contain at least one document")
        if book_excerpts_per_chapter < 1:
            raise ValueError("book_excerpts_per_chapter must be positive")
        benchmark = read_jsonl(benchmark_path)
        target_lengths: dict[str, list[int]] = defaultdict(list)
        fallback_lengths: dict[str, list[int]] = defaultdict(list)
        excluded_ids: dict[str, set[str]] = defaultdict(set)
        for row in benchmark:
            language = str(row.get("language"))
            if language not in CONFIGS:
                continue
            word_count = int(row.get("word_count") or len(str(row["text"]).split()))
            fallback_lengths[language].append(word_count)
            if row.get("role") == "ai_original":
                target_lengths[language].append(word_count)
            match = re.fullmatch(
                rf"wikipedia-{language}-(.+)", str(row.get("sample_id"))
            )
            if match:
                excluded_ids[language].add(match.group(1))
        for language in CONFIGS:
            if not target_lengths[language]:
                target_lengths[language] = fallback_lengths[language]
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

        book_manifest = None
        if italian_book_dir is not None:
            book_documents, book_manifest = self._book_documents(
                italian_book_dir,
                target_lengths["it"],
                excerpts_per_chapter=book_excerpts_per_chapter,
            )
            documents.extend(book_documents)

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
            "length_matching_source": "ai_original_documents",
            "target_word_length": {
                language: {
                    "minimum": min(lengths),
                    "median": statistics.median(lengths),
                    "maximum": max(lengths),
                }
                for language, lengths in target_lengths.items()
            },
            "documents_path": str(output_path),
            "documents_sha256": hashlib.sha256(output_path.read_bytes()).hexdigest(),
            "document_count": len(documents),
            "italian_unpublished_book": book_manifest,
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
                "pinned-wikipedia-calibration-plus-grouped-private-stress-v2"
            ),
            "limitations": [
                "The pinned 2023 Wikipedia snapshot is not guaranteed free of AI-assisted edits.",
                "Controls are encyclopedic and do not estimate FPR on every product domain.",
                "Book excerpts share one author and are reported as a grouped stress evaluation, not threshold-fitting controls.",
            ],
        }
        write_json(output_path.parent / "controls-manifest.json", manifest)
        return manifest

    @classmethod
    def _book_documents(
        cls,
        chapter_dir: Path,
        target_lengths: list[int],
        *,
        excerpts_per_chapter: int,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        if not chapter_dir.is_dir():
            raise FileNotFoundError(chapter_dir)
        chapter_paths = sorted(
            path
            for path in chapter_dir.iterdir()
            if path.is_file() and path.suffix.lower() in {".md", ".markdown"}
        )
        if not chapter_paths:
            raise ValueError(f"No Markdown chapters found in {chapter_dir}")
        documents: list[dict[str, Any]] = []
        chapter_hashes: list[str] = []
        seen_chapter_hashes: set[str] = set()
        seen_group_ids: set[str] = set()
        seen_excerpt_hashes: set[str] = set()
        for chapter_index, path in enumerate(chapter_paths):
            raw = path.read_text(encoding="utf-8")
            normalized = re.sub(r"\s+", " ", raw).strip()
            words = normalized.split()
            longest_target = max(target_lengths)
            if len(words) < longest_target * excerpts_per_chapter:
                raise ValueError(
                    f"Chapter {path.name!r} is too short for "
                    f"{excerpts_per_chapter} non-overlapping matched excerpts"
                )
            chapter_sha = sha256_text(raw)
            if chapter_sha in seen_chapter_hashes:
                raise ValueError("Private book contains duplicate chapters")
            seen_chapter_hashes.add(chapter_sha)
            chapter_hashes.append(chapter_sha)
            group_id = chapter_sha[:20]
            if group_id in seen_group_ids:
                raise ValueError("Private book chapter group ID collision")
            seen_group_ids.add(group_id)
            starts = cls._evenly_spaced_starts(
                len(words), longest_target, excerpts_per_chapter
            )
            for excerpt_index, start in enumerate(starts):
                target = target_lengths[
                    (chapter_index * excerpts_per_chapter + excerpt_index)
                    % len(target_lengths)
                ]
                text = " ".join(words[start : start + target])
                excerpt_sha = sha256_text(text)
                if excerpt_sha in seen_excerpt_hashes:
                    raise ValueError("Private book produced duplicate control excerpts")
                seen_excerpt_hashes.add(excerpt_sha)
                documents.append(
                    {
                        "artifact_schema_version": 1,
                        "artifact_kind": "generic-detector-document",
                        "document_id": (
                            f"human:stress_evaluation:it:book-{group_id}-{excerpt_index + 1}"
                        ),
                        "text_sha256": excerpt_sha,
                        "text": text,
                        "character_count": len(text),
                        "word_count": len(text.split()),
                        "role": "human_control",
                        "control_split": "stress_evaluation",
                        "control_group": "italian_unpublished_book",
                        "source_group_id": group_id,
                        "language": "it",
                        "sample_id": f"italian-unpublished-book-{group_id}",
                        "pipeline": "human_control",
                        "candidate_key": None,
                        "algorithm": None,
                        "domain": "literary_fiction",
                        "quality_pass": None,
                        "changed_token_ratio": None,
                        "gate2b_target_detected": None,
                        "source": {
                            "dataset": "private:italian_unpublished_book",
                            "chapter_sha256": chapter_sha,
                            "chapter_group_id": group_id,
                            "excerpt_index": excerpt_index + 1,
                            "start_word": start,
                            "end_word": start + target,
                            "chapter_word_count": len(words),
                        },
                    }
                )
        set_sha = hashlib.sha256("\n".join(sorted(chapter_hashes)).encode()).hexdigest()
        manifest = {
            "source_directory": str(chapter_dir),
            "chapter_count": len(chapter_paths),
            "unique_chapter_sha256_count": len(set(chapter_hashes)),
            "chapter_set_sha256": set_sha,
            "excerpts_per_chapter": excerpts_per_chapter,
            "excerpt_count": len(documents),
            "split": "stress_evaluation",
            "control_group": "italian_unpublished_book",
            "grouping_unit": "chapter_sha256",
            "threshold_fitting": False,
        }
        return documents, manifest

    @staticmethod
    def _evenly_spaced_starts(
        word_count: int, maximum_excerpt_words: int, excerpt_count: int
    ) -> list[int]:
        maximum_start = word_count - maximum_excerpt_words
        if excerpt_count == 1:
            return [maximum_start // 2]
        starts = [
            round(index * maximum_start / (excerpt_count - 1))
            for index in range(excerpt_count)
        ]
        if any(
            second - first < maximum_excerpt_words for first, second in pairwise(starts)
        ):
            raise ValueError("Cannot produce non-overlapping private book excerpts")
        return starts

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
