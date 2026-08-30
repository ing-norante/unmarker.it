from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any
from urllib.parse import quote

from .adaptive_modal import ModalInvoker, invoke_deployed_modal
from .detector_controls import (
    CONFIGS,
    DATASET_NAME,
    DATASET_REVISION,
    EXCLUDED_TITLE_PREFIXES,
)


def select_fresh_wikipedia_prompts(
    streams: dict[str, Iterable[dict[str, Any]]],
    excluded_ids: dict[str, set[str]],
    *,
    calibration_per_language: int,
    evaluation_per_language: int,
) -> list[dict[str, Any]]:
    if calibration_per_language < 1 or evaluation_per_language < 1:
        raise ValueError("Fresh calibration and evaluation counts must be positive")
    output: list[dict[str, Any]] = []
    requested = calibration_per_language + evaluation_per_language
    for language in ("en", "it"):
        selected = 0
        seen: set[str] = set()
        for example in streams[language]:
            article_id = str(example.get("id") or "")
            title = str(example.get("title") or "").strip()
            text = str(example.get("text") or "").strip()
            if (
                not article_id
                or article_id in seen
                or article_id in excluded_ids.get(language, set())
                or not title
                or len(title) > 200
                or len(text) < 800
                or title.startswith(EXCLUDED_TITLE_PREFIXES[language])
            ):
                continue
            seen.add(article_id)
            split = (
                "calibration"
                if selected < calibration_per_language
                else "evaluation"
            )
            output.append(
                {
                    "id": f"wikipedia-{language}-{article_id}",
                    "language": language,
                    "domain": "encyclopedic",
                    "split": split,
                    "prompt": (
                        f'Write a self-contained explanatory article about "{title}". '
                        "Discuss its background, main characteristics, and significance "
                        "in clear prose."
                    ),
                    "source": {
                        "dataset": DATASET_NAME,
                        "config": CONFIGS[language],
                        "revision": DATASET_REVISION,
                        "article_id": article_id,
                        "title": title,
                        "url": f"https://{language}.wikipedia.org/wiki/{quote(title)}",
                    },
                }
            )
            selected += 1
            if selected == requested:
                break
        if selected != requested:
            raise RuntimeError(
                f"Only found {selected}/{requested} fresh {language} prompts"
            )
    return output


def build_fresh_confirmation_prompts(
    exclusion_paths: tuple[Path, ...],
    output_dir: Path,
    *,
    calibration_per_language: int = 100,
    evaluation_per_language: int = 50,
    seed: int = 20260831,
    shuffle_buffer: int = 50_000,
    invoker: ModalInvoker = invoke_deployed_modal,
) -> dict[str, Any]:
    excluded_ids = _excluded_article_ids(exclusion_paths)
    payload = invoker(
        "unmarker-open-text-detectors",
        "build_fresh_wikipedia_prompts",
        (
            {key: sorted(value) for key, value in excluded_ids.items()},
            calibration_per_language,
            evaluation_per_language,
            seed,
            shuffle_buffer,
        ),
    )
    rows = list(payload["rows"])
    expected = 2 * (calibration_per_language + evaluation_per_language)
    if len(rows) != expected:
        raise RuntimeError(f"Modal returned {len(rows)}/{expected} fresh prompts")
    ids = [str(row["id"]) for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("Fresh prompt response contains duplicate IDs")
    for row in rows:
        language = str(row["language"])
        article_id = str(row["source"]["article_id"])
        if article_id in excluded_ids[language]:
            raise ValueError(f"Fresh prompt overlaps an exclusion: {row['id']}")
    counts = Counter((str(row["language"]), str(row["split"])) for row in rows)
    output_dir.mkdir(parents=True, exist_ok=True)
    prompts_path = output_dir / "prompts.jsonl"
    _write_jsonl(prompts_path, rows)
    manifest = {
        "artifact_schema_version": 1,
        "artifact_kind": "markllm-fully-fresh-confirmation-prompts",
        "dataset": DATASET_NAME,
        "dataset_revision": DATASET_REVISION,
        "dataset_configs": CONFIGS,
        "seed": seed,
        "shuffle_buffer": shuffle_buffer,
        "calibration_per_language": calibration_per_language,
        "evaluation_per_language": evaluation_per_language,
        "prompt_count": len(rows),
        "counts": {
            f"{language}:{split}": counts[(language, split)]
            for language in ("en", "it")
            for split in ("calibration", "evaluation")
        },
        "exclusions": [
            {"path": str(path), "sha256": _sha256(path)}
            for path in exclusion_paths
        ],
        "excluded_article_id_counts": {
            language: len(excluded_ids[language]) for language in ("en", "it")
        },
        "prompts_sha256": _sha256(prompts_path),
        "overlap_with_exclusions": 0,
        "remote": payload.get("metadata", {}),
        "contract": "fresh-calibration-and-evaluation-prompts-v1",
    }
    _write_json(output_dir / "manifest.json", manifest)
    return manifest


def build_fresh_adaptive_slice(
    generations_path: Path,
    output_dir: Path,
    *,
    algorithm: str = "EXP",
    per_language: int = 20,
    seed: int = 20260831,
    generator_family: str = "qwen",
    languages: tuple[str, ...] = ("en", "it"),
) -> dict[str, Any]:
    """Freeze a target-detected slice from an independently generated corpus."""

    if per_language < 1:
        raise ValueError("per_language must be positive")
    languages = tuple(dict.fromkeys(languages))
    if not languages or any(value not in {"en", "it"} for value in languages):
        raise ValueError("languages must contain en and/or it")
    generations = _read_jsonl(generations_path)
    eligible: dict[str, list[dict[str, Any]]] = defaultdict(list)
    thresholds: dict[str, set[float]] = defaultdict(set)
    for row in generations:
        language = str(row.get("language"))
        if (
            row.get("algorithm") != algorithm
            or row.get("split") != "evaluation"
            or language not in languages
            or not row.get("watermarked_text")
            or row.get("calibrated_watermarked_detected") is not True
        ):
            continue
        eligible[language].append(row)
        thresholds[language].add(float(row["calibrated_threshold_1pct"]))

    selected: list[dict[str, Any]] = []
    for language in languages:
        rows = sorted(
            eligible[language],
            key=lambda row: (
                hashlib.sha256(f"{seed}|{row['sample_id']}".encode()).hexdigest(),
                str(row["sample_id"]),
            ),
        )
        if len(rows) < per_language:
            raise ValueError(
                f"Only {len(rows)} eligible {language} rows for {per_language} requested"
            )
        if len(thresholds[language]) != 1:
            raise ValueError(
                f"Expected one compatible {algorithm}/{language} threshold, "
                f"found {sorted(thresholds[language])}"
            )
        selected.extend(rows[:per_language])

    requests = [
        {
            "request_id": f"adaptive-fresh-confirmation-{row['sample_id']}",
            "language": row["language"],
            "text": row["watermarked_text"],
            "generator_family": generator_family,
            "target_algorithm": algorithm,
            "terminology": [],
        }
        for row in selected
    ]
    target_config = {
        "thresholds": {
            algorithm: {
                language: next(iter(thresholds[language]))
                for language in languages
            }
        },
        "operators": {algorithm: "gt"},
        "compatibility": {
            "source": str(generations_path),
            "requirement": (
                "same MarkLLM algorithm, config, tokenizer, revision, and key"
            ),
        },
    }
    manifest = {
        "artifact_schema_version": 1,
        "artifact_kind": "adaptive-cascade-fresh-confirmation-slice",
        "algorithm": algorithm,
        "languages": list(languages),
        "generator_family": generator_family,
        "seed": seed,
        "per_language": per_language,
        "selection": (
            "fresh evaluation + calibrated target detected before rewriting; "
            "SHA-256 seeded ordering within language"
        ),
        "source_hashes": {"generations_sha256": _sha256(generations_path)},
        "eligible_counts": {
            language: len(eligible[language]) for language in languages
        },
        "selected_sample_ids": [str(row["sample_id"]) for row in selected],
        "request_count": len(requests),
        "contract": "independent-confirmation-no-development-selection-v1",
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_jsonl(output_dir / "input.jsonl", requests)
    _write_json(output_dir / "target-config.json", target_config)
    _write_json(output_dir / "manifest.json", manifest)
    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build a fully fresh, hash-locked MarkLLM confirmation prompt corpus"
    )
    parser.add_argument("--exclude", type=Path, nargs="+", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--calibration-per-language", type=int, default=100)
    parser.add_argument("--evaluation-per-language", type=int, default=50)
    parser.add_argument("--seed", type=int, default=20260831)
    parser.add_argument("--shuffle-buffer", type=int, default=50_000)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    manifest = build_fresh_confirmation_prompts(
        tuple(args.exclude),
        args.output,
        calibration_per_language=args.calibration_per_language,
        evaluation_per_language=args.evaluation_per_language,
        seed=args.seed,
        shuffle_buffer=args.shuffle_buffer,
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


def slice_main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a frozen adaptive slice from a fresh MarkLLM corpus"
    )
    parser.add_argument("--generations", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--algorithm", default="EXP")
    parser.add_argument("--per-language", type=int, default=20)
    parser.add_argument("--seed", type=int, default=20260831)
    parser.add_argument("--generator-family", default="qwen")
    parser.add_argument("--languages", default="en,it")
    args = parser.parse_args()
    manifest = build_fresh_adaptive_slice(
        args.generations,
        args.output,
        algorithm=args.algorithm,
        per_language=args.per_language,
        seed=args.seed,
        generator_family=args.generator_family,
        languages=tuple(
            value.strip() for value in args.languages.split(",") if value.strip()
        ),
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


def _excluded_article_ids(paths: tuple[Path, ...]) -> dict[str, set[str]]:
    output = {"en": set(), "it": set()}
    for path in paths:
        for row in _read_jsonl(path):
            language = str(row.get("language") or "")
            source = row.get("source") or {}
            article_id = str(source.get("article_id") or "")
            candidate_id = str(row.get("id") or row.get("sample_id") or "")
            match = re.fullmatch(r"wikipedia-(en|it)-(.+)", candidate_id)
            if match:
                language = match.group(1)
                article_id = article_id or match.group(2)
            if language in output and article_id:
                output[language].add(article_id)
    return output


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows),
        encoding="utf-8",
    )


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    main()
