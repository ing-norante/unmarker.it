from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from .adaptive_cascade import (
    AdaptiveRewriteCascade,
    CascadeConfig,
    CascadeRequest,
    ModelRoute,
    PositionAwareBiraGenerator,
    StructuredPairJudge,
)
from .adaptive_modal import (
    ModalCascadeEvaluator,
    ModalEntityExtractor,
    ModalSelfInformationScorer,
)
from .openrouter_backend import (
    HuggingFaceLogitBiasTokenizer,
    OpenRouterRewriter,
)
from .protected_spans import GLINER_LABELS


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the quality-gated adaptive text rewrite cascade"
    )
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--routes", type=Path, required=True)
    parser.add_argument("--calibration", type=Path, required=True)
    parser.add_argument("--gliner-calibration", type=Path, required=True)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument(
        "--detectors",
        default="binoculars,fast_detect_gpt,logrank,radar",
    )
    parser.add_argument("--target-config", type=Path)
    parser.add_argument("--judge-model", default="openai/gpt-5.6-terra")
    parser.add_argument("--judge-provider", default="OpenAI")
    parser.add_argument("--no-judge", action="store_true")
    parser.add_argument("--enable-position-aware", action="store_true")
    parser.add_argument("--maximum-changed-token-ratio", type=float, default=0.45)
    parser.add_argument("--minimum-semantic-similarity", type=float, default=0.90)
    parser.add_argument("--minimum-nli", type=float, default=0.80)
    parser.add_argument("--no-resume", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.env_file:
        _load_env_key(args.env_file, "OPENROUTER_API_KEY")
    routes_payload = _read_json(args.routes)
    calibration = _read_json(args.calibration)
    gliner = _read_json(args.gliner_calibration)
    target = _read_json(args.target_config) if args.target_config else {}
    route_configs = routes_payload.get("routes", [])
    if not route_configs:
        raise ValueError("Routes config must contain a non-empty routes array")

    routes = []
    position_config = None
    for value in route_configs:
        temperature = value.get("temperature", 0.2)
        backend = OpenRouterRewriter(
            model=str(value["model"]),
            provider=str(value.get("provider") or "") or None,
            temperature=float(temperature) if temperature is not None else None,
            max_tokens=int(value.get("max_tokens", 4096)),
            length_retry_max_tokens=int(value.get("length_retry_max_tokens", 16384)),
            reasoning_effort=str(value.get("reasoning_effort") or "none"),
            allow_fallbacks=bool(value.get("allow_fallbacks", False)),
        )
        requires_bias = bool(args.enable_position_aware and value.get("bias_tokenizer"))
        capability = backend.validate_capabilities(
            require_logit_bias=requires_bias,
            require_seed=True,
        )
        print(
            f"Route {value['id']} preflight: "
            f"{json.dumps(capability, ensure_ascii=False, sort_keys=True)}"
        )
        route = ModelRoute(str(value["id"]), str(value["family"]), backend)
        routes.append(route)
        if requires_bias:
            if position_config is not None:
                raise ValueError(
                    "Configure one bias_tokenizer route per cascade invocation"
                )
            position_config = value

    judge = None
    if not args.no_judge:
        judge_backend = OpenRouterRewriter(
            model=args.judge_model,
            provider=args.judge_provider or None,
            temperature=None,
            max_tokens=4096,
            length_retry_max_tokens=8192,
            reasoning_effort="medium",
            allow_fallbacks=False,
        )
        judge_backend.validate_capabilities(
            require_logit_bias=False,
            require_structured_output=True,
            require_seed=True,
        )
        judge = StructuredPairJudge(judge_backend)

    thresholds = {key: float(value) for key, value in gliner["thresholds"].items()}
    labels = tuple(
        dict.fromkeys(
            [
                *(str(value) for value in gliner.get("labels", [])),
                *GLINER_LABELS,
            ]
        )
    )
    detectors = tuple(
        value.strip() for value in args.detectors.split(",") if value.strip()
    )
    target_thresholds = {
        str(algorithm): {
            str(language): float(threshold) for language, threshold in languages.items()
        }
        for algorithm, languages in target.get("thresholds", {}).items()
    }
    evaluator = ModalCascadeEvaluator(
        calibration,
        thresholds,
        labels,
        judge,
        detectors=detectors,
        target_thresholds=target_thresholds,
        target_operators={
            str(key): str(value) for key, value in target.get("operators", {}).items()
        },
    )
    extractor = ModalEntityExtractor(thresholds, labels)
    position = None
    if args.enable_position_aware:
        if position_config is None:
            raise ValueError(
                "Position-aware mode requires one route with bias_tokenizer"
            )
        tokenizer = HuggingFaceLogitBiasTokenizer(
            str(position_config["bias_tokenizer"]),
            (
                str(position_config["bias_tokenizer_revision"])
                if position_config.get("bias_tokenizer_revision")
                else None
            ),
        )
        position = PositionAwareBiraGenerator(
            ModalSelfInformationScorer(),
            tokenizer,
            beta=float(position_config.get("bira_beta", -5.0)),
            route_ids=(str(position_config["id"]),),
        )
    config = CascadeConfig(
        maximum_changed_token_ratio=args.maximum_changed_token_ratio,
        minimum_semantic_similarity=args.minimum_semantic_similarity,
        minimum_bidirectional_entailment=args.minimum_nli,
        minimum_generic_detectors=len(detectors),
        required_generic_detectors=detectors,
        require_judge=not args.no_judge,
    )
    cascade = AdaptiveRewriteCascade(
        routes,
        evaluator,
        extractor,
        config=config,
        position_aware=position,
    )
    summary = AdaptiveBatchRunner(cascade).run(
        args.input,
        args.output,
        manifest_inputs={
            "routes_sha256": _sha256(args.routes),
            "calibration_sha256": _sha256(args.calibration),
            "gliner_calibration_sha256": _sha256(args.gliner_calibration),
            "target_config_sha256": _sha256(args.target_config),
            "detectors": list(detectors),
            "config": json.loads(
                json.dumps(vars(args) | {"env_file": None}, default=str)
            ),
        },
        resume=not args.no_resume,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False, sort_keys=True))


class AdaptiveBatchRunner:
    ARTIFACT_SCHEMA_VERSION = 1

    def __init__(self, cascade: AdaptiveRewriteCascade) -> None:
        self.cascade = cascade

    def run(
        self,
        input_path: Path,
        output_path: Path,
        manifest_inputs: dict[str, Any],
        resume: bool = True,
    ) -> dict[str, Any]:
        rows = _read_jsonl(input_path)
        request_ids = [str(value["request_id"]) for value in rows]
        if len(request_ids) != len(set(request_ids)):
            raise ValueError("Adaptive input request_id values must be unique")
        manifest = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "artifact_kind": "unmarker-adaptive-cascade-run",
            "input_sha256": _sha256(input_path),
            **manifest_inputs,
        }
        manifest_path = output_path.with_suffix(".manifest.json")
        if resume and output_path.exists():
            if not manifest_path.exists() or _read_json(manifest_path) != manifest:
                raise ValueError("Cannot resume adaptive cascade with different inputs")
            existing = _read_jsonl(output_path)
        else:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text("", encoding="utf-8")
            existing = []
        _write_json(manifest_path, manifest)
        completed = {str(value["request_id"]): value for value in existing}
        for row in rows:
            request_id = str(row["request_id"])
            if completed.get(request_id, {}).get("status") == "success":
                continue
            try:
                request = CascadeRequest(
                    request_id=request_id,
                    text=str(row["text"]),
                    language=str(row["language"]),
                    generator_family=(
                        str(row["generator_family"])
                        if row.get("generator_family")
                        else None
                    ),
                    target_algorithm=(
                        str(row["target_algorithm"])
                        if row.get("target_algorithm")
                        else None
                    ),
                    terminology=tuple(
                        str(value) for value in row.get("terminology", [])
                    ),
                )
                result = self.cascade.run(request)
                payload = {
                    "request_id": request_id,
                    "status": "success",
                    "cascade_status": result.status,
                    "selected_text": result.selected.candidate.text,
                    "result": result.to_dict(),
                }
            except Exception as error:  # noqa: BLE001 - one failed batch item must not abort peers
                payload = {
                    "request_id": request_id,
                    "status": "error",
                    "error_type": type(error).__name__,
                    "error": str(error),
                }
            completed[request_id] = payload
            _append_jsonl(output_path, payload)
        ordered = [completed[request_id] for request_id in request_ids]
        _write_jsonl(output_path, ordered)
        return {
            "requested": len(rows),
            "succeeded": sum(value["status"] == "success" for value in ordered),
            "failed": sum(value["status"] == "error" for value in ordered),
            "accepted": sum(
                value.get("cascade_status") == "accepted" for value in ordered
            ),
            "best_effort": sum(
                value.get("cascade_status") == "best_effort" for value in ordered
            ),
            "not_needed": sum(
                value.get("cascade_status") == "not_needed" for value in ordered
            ),
            "total_openrouter_cost_usd": sum(
                float(
                    value.get("result", {})
                    .get("metadata", {})
                    .get("usage", {})
                    .get("cost_usd", 0.0)
                )
                for value in ordered
                if value["status"] == "success"
            ),
            "output": str(output_path),
        }


def _load_env_key(path: Path, key: str) -> None:
    if not path.exists():
        raise FileNotFoundError(path)
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        name, separator, value = line.partition("=")
        if separator and name.strip() == key:
            cleaned = value.strip().strip("\"'")
            if not cleaned:
                raise ValueError(f"{key} is empty in {path}")
            os.environ[key] = cleaned
            return
    raise ValueError(f"{key} was not found in {path}")


def _read_json(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise TypeError(f"Expected a JSON object in {path}")
    return value


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def _append_jsonl(path: Path, row: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        handle.flush()


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True, default=str)
        + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _sha256(path: Path | None) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path else None


if __name__ == "__main__":
    main()
