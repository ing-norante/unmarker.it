from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
SOURCE_PROVENANCE_VALUES = {
    "supported_claude_marked",
    "non_claude_control",
    "unknown",
}


def export_adaptive_pairs(
    result_paths: list[Path],
    output_dir: Path,
    *,
    source_provenance: str = "unknown",
    expected_generator_family: str | None = None,
    source_model: str | None = None,
    source_surface: str | None = None,
) -> dict[str, Any]:
    """Freeze source/selected pairs for an external Anthropic detector run.

    The public Claude Content Checker cannot consume these text records. The
    batch is intentionally provider-neutral at the transport boundary so an
    approved private-preview client can map its response to our normalized
    result schema without changing the benchmark corpus.
    """

    if not result_paths:
        raise ValueError("At least one adaptive result path is required")
    if source_provenance not in SOURCE_PROVENANCE_VALUES:
        raise ValueError(
            "source_provenance must be one of "
            + ", ".join(sorted(SOURCE_PROVENANCE_VALUES))
        )
    if source_provenance == "supported_claude_marked" and not (
        source_model and source_surface
    ):
        raise ValueError(
            "Supported marked Claude provenance requires source_model and "
            "source_surface"
        )
    if (
        source_provenance == "supported_claude_marked"
        and expected_generator_family != "anthropic"
    ):
        raise ValueError(
            "Supported marked Claude provenance requires "
            "expected_generator_family='anthropic'"
        )

    requests: list[dict[str, Any]] = []
    seen_request_ids: set[str] = set()
    source_files: list[dict[str, str]] = []
    for path in result_paths:
        source_files.append(
            {
                "path": path.as_posix(),
                "sha256": _sha256_file(path),
            }
        )
        for row in _read_jsonl(path):
            if row.get("status") != "success":
                raise ValueError(
                    f"Adaptive result {row.get('request_id')!r} is not successful"
                )
            result = row.get("result")
            if not isinstance(result, dict):
                raise TypeError("Adaptive result row is missing result")
            request = result.get("request")
            selected = result.get("selected")
            if not isinstance(request, dict) or not isinstance(selected, dict):
                raise TypeError("Adaptive result is missing request or selected")
            request_id = str(request.get("request_id") or row.get("request_id") or "")
            if not request_id:
                raise ValueError("Adaptive result is missing request_id")
            if request_id in seen_request_ids:
                raise ValueError(f"Duplicate adaptive request_id: {request_id}")
            seen_request_ids.add(request_id)
            family = str(request.get("generator_family") or "unknown")
            if expected_generator_family and family != expected_generator_family:
                raise ValueError(
                    f"Request {request_id} has generator family {family!r}; "
                    f"expected {expected_generator_family!r}"
                )
            language = str(request.get("language") or "")
            if language not in {"en", "it"}:
                raise ValueError(f"Unsupported language for {request_id}: {language!r}")
            source_text = str(request.get("text") or "")
            candidate = selected.get("candidate")
            if not isinstance(candidate, dict):
                raise TypeError(f"Selected candidate is missing for {request_id}")
            selected_text = str(candidate.get("text") or "")
            if not source_text.strip() or not selected_text.strip():
                raise ValueError(f"Empty source or selected text for {request_id}")

            common = {
                "artifact_schema_version": SCHEMA_VERSION,
                "request_id": request_id,
                "language": language,
                "generator_family": family,
                "source_provenance": source_provenance,
                "cascade_status": str(result.get("status") or ""),
            }
            requests.extend(
                [
                    _detector_request(
                        common,
                        variant="source",
                        text=source_text,
                        candidate_id=str(
                            (result.get("baseline") or {})
                            .get("candidate", {})
                            .get("candidate_id", f"{request_id}|original")
                        ),
                        quality_pass=True,
                    ),
                    _detector_request(
                        common,
                        variant="selected",
                        text=selected_text,
                        candidate_id=str(candidate.get("candidate_id") or ""),
                        quality_pass=bool(selected.get("quality_pass")),
                    ),
                ]
            )

    item_ids = [str(row["item_id"]) for row in requests]
    if len(item_ids) != len(set(item_ids)):
        raise ValueError("Export produced duplicate item IDs")

    requests.sort(key=lambda row: (str(row["request_id"]), str(row["variant"])))
    manifest = {
        "artifact_schema_version": SCHEMA_VERSION,
        "artifact_kind": "anthropic-text-watermark-external-batch",
        "access_contract": "anthropic-private-preview-required",
        "selection_visibility": "posthoc-holdout-only",
        "public_content_checker_compatible": False,
        "public_content_checker_scope": "c2pa-file-credentials-only",
        "source_provenance": source_provenance,
        "source_model": source_model,
        "source_surface": source_surface,
        "expected_generator_family": expected_generator_family,
        "request_count": len(seen_request_ids),
        "item_count": len(requests),
        "languages": sorted({str(row["language"]) for row in requests}),
        "generator_families": sorted(
            {str(row["generator_family"]) for row in requests}
        ),
        "source_files": source_files,
        "batch_sha256": _sha256_rows(requests),
        "normalized_result_schema": {
            "required": [
                "item_id",
                "text_sha256",
                "status",
                "mark_detected",
            ],
            "status": ["success", "error"],
            "mark_detected": "boolean for success; null for error",
            "optional": ["detector_version", "raw_result", "error"],
        },
    }
    template = [
        {
            "item_id": row["item_id"],
            "text_sha256": row["text_sha256"],
            "status": "pending",
            "mark_detected": None,
            "detector_version": None,
            "raw_result": None,
            "error": None,
        }
        for row in requests
    ]
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_jsonl(output_dir / "batch.jsonl", requests)
    _write_jsonl(output_dir / "detector-results.template.jsonl", template)
    _write_json(output_dir / "manifest.json", manifest)
    return manifest


def report_official_results(
    batch_path: Path,
    result_path: Path,
    output_dir: Path,
    *,
    allow_incomplete: bool = False,
    manifest_path: Path | None = None,
) -> dict[str, Any]:
    batch = _read_jsonl(batch_path)
    results = _read_jsonl(result_path)
    if not batch:
        raise ValueError("Anthropic detector batch is empty")
    manifest_path = manifest_path or batch_path.with_name("manifest.json")
    manifest = _read_json(manifest_path)
    if manifest.get("artifact_kind") != "anthropic-text-watermark-external-batch":
        raise ValueError("Invalid Anthropic detector batch manifest kind")
    if manifest.get("batch_sha256") != _sha256_rows(batch):
        raise ValueError("Anthropic detector batch does not match manifest hash")
    if int(manifest.get("item_count", -1)) != len(batch):
        raise ValueError("Anthropic detector batch count does not match manifest")
    batch_by_id = _unique_by(batch, "item_id", "batch")
    result_by_id = _unique_by(results, "item_id", "detector results")
    unknown = sorted(set(result_by_id) - set(batch_by_id))
    if unknown:
        raise ValueError(f"Detector results contain unknown item IDs: {unknown[:5]}")

    normalized: dict[str, dict[str, Any]] = {}
    for item_id, request in batch_by_id.items():
        result = result_by_id.get(item_id)
        if result is None:
            continue
        if result.get("text_sha256") != request.get("text_sha256"):
            raise ValueError(f"Text hash mismatch for detector item {item_id}")
        status = result.get("status")
        if status not in {"success", "error", "pending"}:
            raise ValueError(f"Invalid detector status for {item_id}: {status!r}")
        if status == "success" and not isinstance(result.get("mark_detected"), bool):
            raise ValueError(
                f"Successful detector result {item_id} needs Boolean mark_detected"
            )
        if status != "success" and result.get("mark_detected") is not None:
            raise ValueError(
                f"Non-success detector result {item_id} must not set mark_detected"
            )
        normalized[item_id] = result

    successful = {
        item_id: row
        for item_id, row in normalized.items()
        if row["status"] == "success"
    }
    complete = len(successful) == len(batch_by_id)
    if not complete and not allow_incomplete:
        raise ValueError(
            f"Official detector results are incomplete: {len(successful)}/"
            f"{len(batch_by_id)} successful"
        )

    requests: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for item_id, item in batch_by_id.items():
        requests[str(item["request_id"])][str(item["variant"])] = {
            "request": item,
            "result": successful.get(item_id),
        }
    invalid_pairs = sorted(
        request_id
        for request_id, variants in requests.items()
        if set(variants) != {"source", "selected"}
    )
    if invalid_pairs:
        raise ValueError(
            f"Batch contains invalid source/selected pairs: {invalid_pairs[:5]}"
        )

    languages = sorted({str(item["language"]) for item in batch_by_id.values()})
    summaries = {
        language: _summarize_pairs(requests, language=language)
        for language in languages
    }
    combined = _summarize_pairs(requests, language=None)
    row_provenance = sorted(
        {
            str(item.get("source_provenance") or "unknown")
            for item in batch_by_id.values()
        }
    )
    provenance = str(manifest.get("source_provenance") or "unknown")
    if row_provenance != [provenance]:
        raise ValueError("Source provenance differs between batch and manifest")
    payload = {
        "artifact_schema_version": SCHEMA_VERSION,
        "artifact_kind": "anthropic-text-watermark-external-report",
        "detector": "anthropic_official_text_watermark_private_preview",
        "selection_visibility": "posthoc-holdout-only",
        "source_provenance": provenance,
        "source_model": manifest.get("source_model"),
        "source_surface": manifest.get("source_surface"),
        "complete": complete,
        "batch_item_count": len(batch_by_id),
        "successful_item_count": len(successful),
        "missing_or_failed_item_count": len(batch_by_id) - len(successful),
        "languages": summaries,
        "combined": combined,
        "claim_admissible": (
            complete
            and provenance == "supported_claude_marked"
            and bool(manifest.get("source_model"))
            and bool(manifest.get("source_surface"))
            and manifest.get("expected_generator_family") == "anthropic"
            and manifest.get("generator_families") == ["anthropic"]
            and combined["paired_count"] > 0
            and combined["source_detected_count"] > 0
        ),
        "limitations": [
            "A detected mark indicates possible Claude processing, not full authorship provenance.",
            "No detected mark does not prove that Claude or another AI was not involved.",
            "This post-hoc detector was not visible to candidate generation or selection.",
        ],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    _write_json(output_dir / "summary.json", payload)
    (output_dir / "REPORT.md").write_text(_markdown_report(payload), encoding="utf-8")
    return payload


def _detector_request(
    common: dict[str, Any],
    *,
    variant: str,
    text: str,
    candidate_id: str,
    quality_pass: bool,
) -> dict[str, Any]:
    request_id = str(common["request_id"])
    return {
        **common,
        "item_id": f"{request_id}|{variant}",
        "variant": variant,
        "candidate_id": candidate_id,
        "quality_pass": quality_pass,
        "text": text,
        "text_sha256": hashlib.sha256(text.encode()).hexdigest(),
    }


def _summarize_pairs(
    requests: dict[str, dict[str, dict[str, Any]]],
    *,
    language: str | None,
) -> dict[str, Any]:
    pairs = []
    for request_id, variants in requests.items():
        source = variants["source"]
        selected = variants["selected"]
        if language is not None and source["request"].get("language") != language:
            continue
        if source["result"] is None or selected["result"] is None:
            continue
        pairs.append((request_id, source, selected))

    source_detected = sum(
        bool(source["result"]["mark_detected"]) for _, source, _ in pairs
    )
    selected_detected = sum(
        bool(selected["result"]["mark_detected"]) for _, _, selected in pairs
    )
    conditional_evasions = sum(
        bool(source["result"]["mark_detected"])
        and not bool(selected["result"]["mark_detected"])
        for _, source, selected in pairs
    )
    mark_introductions = sum(
        not bool(source["result"]["mark_detected"])
        and bool(selected["result"]["mark_detected"])
        for _, source, selected in pairs
    )
    quality_safe_evasions = sum(
        bool(source["result"]["mark_detected"])
        and not bool(selected["result"]["mark_detected"])
        and bool(selected["request"].get("quality_pass"))
        for _, source, selected in pairs
    )
    return {
        "paired_count": len(pairs),
        "source_detected_count": source_detected,
        "source_detected_rate": _rate(source_detected, len(pairs)),
        "selected_detected_count": selected_detected,
        "selected_detected_rate": _rate(selected_detected, len(pairs)),
        "conditional_evasion_count": conditional_evasions,
        "conditional_evasion_rate": _rate(conditional_evasions, source_detected),
        "quality_preserving_conditional_evasion_count": quality_safe_evasions,
        "quality_preserving_conditional_evasion_rate": _rate(
            quality_safe_evasions, source_detected
        ),
        "mark_introduction_count": mark_introductions,
        "mark_introduction_rate": _rate(
            mark_introductions, len(pairs) - source_detected
        ),
    }


def _markdown_report(payload: dict[str, Any]) -> str:
    def percent(value: float | None) -> str:
        return "n/a" if value is None else f"{value * 100:.1f}%"

    rows = []
    for language, summary in [
        *payload["languages"].items(),
        ("combined", payload["combined"]),
    ]:
        rows.append(
            "| "
            + " | ".join(
                [
                    language,
                    str(summary["paired_count"]),
                    percent(summary["source_detected_rate"]),
                    percent(summary["selected_detected_rate"]),
                    percent(summary["conditional_evasion_rate"]),
                    percent(summary["quality_preserving_conditional_evasion_rate"]),
                    str(summary["mark_introduction_count"]),
                ]
            )
            + " |"
        )
    admissible = "yes" if payload["claim_admissible"] else "no"
    complete = "yes" if payload["complete"] else "no"
    return "\n".join(
        [
            "# Anthropic official text-watermark holdout",
            "",
            f"Complete: **{complete}**. Claim admissible: **{admissible}**.",
            "",
            "This is a post-hoc holdout. The official detector outcome was not visible ",
            "to candidate generation or selection.",
            "",
            "| Language | Pairs | Source detected | Selected detected | Conditional evasion | Quality-preserving evasion | Mark introductions |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
            *rows,
            "",
            "## Interpretation limits",
            "",
            *[f"- {value}" for value in payload["limitations"]],
            "",
        ]
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Prepare and report Anthropic private-preview text mark checks"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    export = subparsers.add_parser(
        "export", help="Freeze adaptive source/selected pairs"
    )
    export.add_argument("--adaptive-results", action="append", type=Path, required=True)
    export.add_argument("--output", type=Path, required=True)
    export.add_argument(
        "--source-provenance",
        choices=sorted(SOURCE_PROVENANCE_VALUES),
        default="unknown",
    )
    export.add_argument("--expected-generator-family")
    export.add_argument("--source-model")
    export.add_argument("--source-surface")

    report = subparsers.add_parser(
        "report", help="Validate normalized results and report"
    )
    report.add_argument("--batch", type=Path, required=True)
    report.add_argument("--results", type=Path, required=True)
    report.add_argument("--output", type=Path, required=True)
    report.add_argument("--manifest", type=Path)
    report.add_argument("--allow-incomplete", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "export":
        payload = export_adaptive_pairs(
            args.adaptive_results,
            args.output,
            source_provenance=args.source_provenance,
            expected_generator_family=args.expected_generator_family,
            source_model=args.source_model,
            source_surface=args.source_surface,
        )
    else:
        payload = report_official_results(
            args.batch,
            args.results,
            args.output,
            allow_incomplete=args.allow_incomplete,
            manifest_path=args.manifest,
        )
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def _unique_by(
    rows: Iterable[dict[str, Any]], key: str, label: str
) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = str(row.get(key) or "")
        if not value:
            raise ValueError(f"{label} row is missing {key}")
        if value in output:
            raise ValueError(f"Duplicate {key} in {label}: {value}")
        output[value] = row
    return output


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise TypeError(f"Expected object at {path}:{line_number}")
            rows.append(value)
    return rows


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"Expected object in {path}")
    return value


def _write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.write_text(
        "".join(
            json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows
        ),
        encoding="utf-8",
    )


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _sha256_rows(rows: Iterable[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for row in rows:
        digest.update(json.dumps(row, ensure_ascii=False, sort_keys=True).encode())
        digest.update(b"\n")
    return digest.hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


if __name__ == "__main__":
    main()
