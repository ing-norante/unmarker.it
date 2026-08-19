#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any


DATASET_NAME = "wikimedia/wikipedia"
DATASET_REVISION = "b04c8d1ceb2f5cd4588862100d08de323dccfbaa"
CONFIGS = {"en": "20231101.en", "it": "20231101.it"}
EXCLUDED_TITLE_PREFIXES = {
    "en": ("List of ", "Category:", "Template:", "Wikipedia:"),
    "it": ("Lista di ", "Categoria:", "Template:", "Wikipedia:"),
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build independent bilingual MarkLLM prompts from a pinned Wikipedia dump"
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--calibration-per-language", type=int, default=100)
    parser.add_argument("--evaluation-per-language", type=int, default=100)
    parser.add_argument("--seed", type=int, default=20260819)
    parser.add_argument("--shuffle-buffer", type=int, default=10_000)
    return parser


def build_prompt(title: str, language: str) -> str:
    normalized_title = re.sub(r"\s+", " ", title).strip()
    if language == "it":
        return (
            f'Scrivi un articolo esplicativo autonomo su "{normalized_title}". '
            "Descrivine il contesto, le caratteristiche principali e la rilevanza in una prosa chiara."
        )
    return (
        f'Write a self-contained explanatory article about "{normalized_title}". '
        "Discuss its background, main characteristics, and significance in clear prose."
    )


def usable(example: dict[str, Any], language: str) -> bool:
    title = str(example.get("title", "")).strip()
    text = str(example.get("text", ""))
    return (
        4 <= len(title) <= 120
        and not title.startswith(EXCLUDED_TITLE_PREFIXES[language])
        and len(text) >= 800
    )


def main() -> None:
    args = build_parser().parse_args()
    try:
        from datasets import load_dataset
    except ImportError as error:
        raise SystemExit("Install the markllm optional dependencies before building prompts") from error

    requested = args.calibration_per_language + args.evaluation_per_language
    rows: list[dict[str, Any]] = []
    for language, config_name in CONFIGS.items():
        stream = load_dataset(
            DATASET_NAME,
            config_name,
            split="train",
            streaming=True,
            revision=DATASET_REVISION,
        ).shuffle(seed=args.seed + (0 if language == "en" else 1), buffer_size=args.shuffle_buffer)
        selected: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for example in stream:
            article_id = str(example.get("id", ""))
            if not article_id or article_id in seen_ids or not usable(example, language):
                continue
            seen_ids.add(article_id)
            selected.append(example)
            if len(selected) >= requested:
                break
        if len(selected) != requested:
            raise RuntimeError(f"Only found {len(selected)}/{requested} usable {language} articles")

        for index, example in enumerate(selected):
            split = "calibration" if index < args.calibration_per_language else "evaluation"
            article_id = str(example["id"])
            rows.append(
                {
                    "id": f"wikipedia-{language}-{article_id}",
                    "language": language,
                    "domain": "encyclopedic",
                    "split": split,
                    "prompt": build_prompt(str(example["title"]), language),
                    "source": {
                        "dataset": DATASET_NAME,
                        "config": config_name,
                        "revision": DATASET_REVISION,
                        "article_id": article_id,
                        "title": str(example["title"]),
                        "url": str(example.get("url", "")),
                    },
                }
            )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = args.output.with_name(f"{args.output.name}.tmp")
    with temporary_output.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    temporary_output.replace(args.output)
    print(f"Wrote {len(rows)} independent prompts to {args.output.resolve()}", flush=True)
    # Some pyarrow streaming workers can block interpreter shutdown on macOS
    # after every output handle is already closed. At this point the artifact is
    # durable, so avoid waiting on third-party background thread destructors.
    os._exit(0)


if __name__ == "__main__":
    main()
