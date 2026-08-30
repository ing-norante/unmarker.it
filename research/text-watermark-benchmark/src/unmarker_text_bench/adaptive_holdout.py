from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def build_controlled_holdout(
    generations_path: Path,
    candidates_path: Path,
    output_dir: Path,
    *,
    algorithm: str = "EXP",
    per_language: int = 5,
    seed: int = 20260830,
    generator_family: str = "qwen",
    attack_split: str = "held_out_test",
    languages: tuple[str, ...] = ("en", "it"),
) -> dict[str, Any]:
    """Select a deterministic, pre-attack-detected adaptive experiment slice."""

    if per_language < 1:
        raise ValueError("per_language must be positive")
    if attack_split not in {"development", "held_out_test"}:
        raise ValueError("attack_split must be development or held_out_test")
    languages = tuple(dict.fromkeys(languages))
    if not languages or any(value not in {"en", "it"} for value in languages):
        raise ValueError("languages must contain en and/or it")
    generations = _read_jsonl(generations_path)
    candidates = _read_jsonl(candidates_path)
    attack_splits: dict[tuple[str, str], str] = {}
    for row in candidates:
        key = (str(row["sample_id"]), str(row["algorithm"]))
        split = str(row["attack_split"])
        previous = attack_splits.setdefault(key, split)
        if previous != split:
            raise ValueError(f"Inconsistent attack split for {key}")

    eligible: dict[str, list[dict[str, Any]]] = defaultdict(list)
    thresholds: dict[str, set[float]] = defaultdict(set)
    for row in generations:
        language = str(row.get("language"))
        key = (str(row.get("sample_id")), str(row.get("algorithm")))
        if (
            key[1] != algorithm
            or row.get("split") != "evaluation"
            or language not in languages
            or attack_splits.get(key) != attack_split
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
                hashlib.sha256(
                    f"{seed}|{row['sample_id']}".encode()
                ).hexdigest(),
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
            "request_id": (
                f"adaptive-holdout-{row['sample_id']}"
                if attack_split == "held_out_test"
                else f"adaptive-development-{row['sample_id']}"
            ),
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
            "requirement": "same MarkLLM algorithm, config, tokenizer, revision, and key",
        },
    }
    manifest = {
        "artifact_schema_version": 1,
        "artifact_kind": (
            "adaptive-cascade-controlled-holdout"
            if attack_split == "held_out_test"
            else "adaptive-cascade-controlled-slice"
        ),
        "algorithm": algorithm,
        "attack_split": attack_split,
        "languages": list(languages),
        "generator_family": generator_family,
        "seed": seed,
        "per_language": per_language,
        "selection": (
            f"evaluation + {attack_split} + calibrated target detected before attack; "
            "SHA-256 seeded ordering within language"
        ),
        "source_hashes": {
            "generations_sha256": _sha256(generations_path),
            "candidates_sha256": _sha256(candidates_path),
        },
        "eligible_counts": {
            language: len(eligible[language]) for language in languages
        },
        "selected_sample_ids": [str(row["sample_id"]) for row in selected],
        "request_count": len(requests),
        "limitations": [
            "This slice was part of the earlier fixed-grid confirmation corpus.",
            "Selection is conditional on compatible target detection before rewriting.",
        ],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_jsonl(output_dir / "input.jsonl", requests)
    _write_json(output_dir / "target-config.json", target_config)
    _write_json(output_dir / "manifest.json", manifest)
    return manifest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build a deterministic adaptive-cascade holdout slice"
    )
    parser.add_argument("--generations", type=Path, required=True)
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--algorithm", default="EXP")
    parser.add_argument("--per-language", type=int, default=5)
    parser.add_argument("--seed", type=int, default=20260830)
    parser.add_argument("--generator-family", default="qwen")
    parser.add_argument(
        "--attack-split",
        choices=("development", "held_out_test"),
        default="held_out_test",
    )
    parser.add_argument("--languages", default="en,it")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    manifest = build_controlled_holdout(
        args.generations,
        args.candidates,
        args.output,
        algorithm=args.algorithm,
        per_language=args.per_language,
        seed=args.seed,
        generator_family=args.generator_family,
        attack_split=args.attack_split,
        languages=tuple(
            value.strip() for value in args.languages.split(",") if value.strip()
        ),
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))


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
