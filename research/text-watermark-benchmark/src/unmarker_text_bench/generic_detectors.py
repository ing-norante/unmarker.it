from __future__ import annotations

import hashlib
import json
import os
import random
import statistics
import threading
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

ARTIFACT_SCHEMA_VERSION = 1
MANIFEST_KIND = "unmarker-generic-detector-corpus"
RESULT_KIND = "unmarker-generic-detector-result"
EXPECTED_PIPELINES = (
    "simple_paraphrase",
    "sira",
    "bira",
    "bira_position_aware",
)


class DetectorError(RuntimeError):
    pass


class DetectorClient(Protocol):
    detector_id: str

    @property
    def metadata(self) -> dict[str, Any]: ...

    def detect(self, document: dict[str, Any]) -> dict[str, Any]: ...


Transport = Callable[[urllib.request.Request, float], tuple[int, bytes]]


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSONL at {path}:{line_number}") from error
            if not isinstance(value, dict):
                raise TypeError(f"Expected an object at {path}:{line_number}")
            rows.append(value)
    return rows


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    temporary.replace(path)


class GenericCorpusBuilder:
    """Build one immutable corpus from Gate 2b progressive selections."""

    def run(self, selections_path: Path, output_dir: Path) -> dict[str, Any]:
        rows = read_jsonl(selections_path)
        if not rows:
            raise ValueError("The progressive selections artifact is empty")

        candidates: list[dict[str, Any]] = []
        originals: dict[tuple[str, str], dict[str, Any]] = {}
        seen_candidate_keys: set[str] = set()
        pipelines_by_sample: dict[tuple[str, str], set[str]] = defaultdict(set)
        for row in rows:
            self._validate_selection(row)
            language = str(row["language"])
            sample_id = str(row["sample_id"])
            pipeline = str(row["pipeline"])
            candidate_key = str(row["candidate_key"])
            sample_key = (language, sample_id)
            if candidate_key in seen_candidate_keys:
                raise ValueError(f"Duplicate candidate_key: {candidate_key}")
            seen_candidate_keys.add(candidate_key)
            pipelines_by_sample[sample_key].add(pipeline)

            original_text = str(row["original_text"])
            existing = originals.get(sample_key)
            if existing is not None and existing["text"] != original_text:
                raise ValueError(
                    f"Inconsistent original_text for {language}/{sample_id}"
                )
            originals[sample_key] = self._document(
                document_id=f"original:{language}:{sample_id}",
                role="ai_original",
                language=language,
                sample_id=sample_id,
                pipeline="original",
                candidate_key=None,
                text=original_text,
                selection=row,
            )
            candidates.append(
                self._document(
                    document_id=f"rewrite:{candidate_key}",
                    role="rewrite",
                    language=language,
                    sample_id=sample_id,
                    pipeline=pipeline,
                    candidate_key=candidate_key,
                    text=str(row["candidate_text"]),
                    selection=row,
                )
            )

        invalid_pipeline_cells = {
            f"{language}:{sample_id}": sorted(pipelines)
            for (language, sample_id), pipelines in pipelines_by_sample.items()
            if pipelines != set(EXPECTED_PIPELINES)
        }
        if invalid_pipeline_cells:
            raise ValueError(
                "Each sample must contain exactly the four benchmark pipelines: "
                f"{invalid_pipeline_cells}"
            )

        documents = sorted(
            [*originals.values(), *candidates],
            key=lambda row: (
                str(row["language"]),
                str(row["sample_id"]),
                0 if row["role"] == "ai_original" else 1,
                str(row["pipeline"]),
            ),
        )
        document_ids = [str(row["document_id"]) for row in documents]
        if len(set(document_ids)) != len(document_ids):
            raise ValueError("Generated document IDs are not unique")

        output_dir.mkdir(parents=True, exist_ok=True)
        documents_path = output_dir / "documents.jsonl"
        write_jsonl(documents_path, documents)
        counts = Counter((str(row["language"]), str(row["role"])) for row in documents)
        lengths = [len(str(row["text"])) for row in documents]
        manifest = {
            "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
            "artifact_kind": MANIFEST_KIND,
            "created_at": utc_now(),
            "source_path": str(selections_path),
            "source_sha256": hashlib.sha256(selections_path.read_bytes()).hexdigest(),
            "documents_path": documents_path.name,
            "documents_sha256": hashlib.sha256(documents_path.read_bytes()).hexdigest(),
            "document_count": len(documents),
            "unique_text_count": len({row["text_sha256"] for row in documents}),
            "original_count": sum(row["role"] == "ai_original" for row in documents),
            "rewrite_count": sum(row["role"] == "rewrite" for row in documents),
            "sample_count": len(originals),
            "pipelines": list(EXPECTED_PIPELINES),
            "counts_by_language_and_role": {
                f"{language}:{role}": value
                for (language, role), value in sorted(counts.items())
            },
            "character_length": {
                "minimum": min(lengths),
                "median": statistics.median(lengths),
                "maximum": max(lengths),
            },
            "copyleaks_minimum_character_contract_pass": min(lengths) >= 255,
            "corpus_contract": (
                "one-original-per-language-sample-plus-four-held-out-rewrites-v1"
            ),
        }
        write_json(output_dir / "manifest.json", manifest)
        return manifest

    @staticmethod
    def _validate_selection(row: dict[str, Any]) -> None:
        required = {
            "candidate_key",
            "sample_id",
            "language",
            "pipeline",
            "original_text",
            "candidate_text",
        }
        missing = sorted(required - set(row))
        if missing:
            raise ValueError(f"Selection row is missing fields: {missing}")
        if row["language"] not in {"en", "it"}:
            raise ValueError(f"Unsupported language: {row['language']!r}")
        if row["pipeline"] not in EXPECTED_PIPELINES:
            raise ValueError(f"Unexpected pipeline: {row['pipeline']!r}")
        if (
            not str(row["original_text"]).strip()
            or not str(row["candidate_text"]).strip()
        ):
            raise ValueError("Detector documents cannot be empty")

    @staticmethod
    def _document(
        *,
        document_id: str,
        role: str,
        language: str,
        sample_id: str,
        pipeline: str,
        candidate_key: str | None,
        text: str,
        selection: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
            "artifact_kind": "generic-detector-document",
            "document_id": document_id,
            "text_sha256": sha256_text(text),
            "text": text,
            "character_count": len(text),
            "word_count": len(text.split()),
            "role": role,
            "language": language,
            "sample_id": sample_id,
            "pipeline": pipeline,
            "candidate_key": candidate_key,
            "algorithm": selection.get("algorithm"),
            "domain": selection.get("domain"),
            "quality_pass": (
                None if role == "ai_original" else bool(selection.get("quality_pass"))
            ),
            "changed_token_ratio": (
                None if role == "ai_original" else selection.get("changed_token_ratio")
            ),
            "gate2b_target_detected": (
                bool(selection.get("preattack_detected"))
                if role == "ai_original"
                else bool(selection.get("target_detected"))
            ),
        }


class JsonApiClient:
    def __init__(
        self,
        *,
        timeout_seconds: float = 120.0,
        max_retries: int = 5,
        transport: Transport | None = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.transport = transport or self._urlopen_transport

    def request_json(
        self,
        *,
        url: str,
        body: dict[str, Any],
        headers: dict[str, str],
    ) -> tuple[dict[str, Any], int]:
        request = urllib.request.Request(
            url,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        attempts = 0
        while True:
            attempts += 1
            try:
                status, raw = self.transport(request, self.timeout_seconds)
                if not 200 <= status < 300:
                    raise DetectorError(f"HTTP {status}: {raw[:500]!r}")
                payload = json.loads(raw.decode("utf-8"))
                if not isinstance(payload, dict):
                    raise DetectorError("Detector response must be a JSON object")
                return payload, attempts
            except urllib.error.HTTPError as error:
                retryable = error.code == 429 or 500 <= error.code < 600
                if not retryable or attempts > self.max_retries:
                    detail = error.read(1000).decode("utf-8", errors="replace")
                    raise DetectorError(f"HTTP {error.code}: {detail}") from error
                self._retry_delay(attempts, error.headers.get("Retry-After"))
            except (urllib.error.URLError, TimeoutError) as error:
                if attempts > self.max_retries:
                    raise DetectorError(str(error)) from error
                self._retry_delay(attempts, None)

    @staticmethod
    def _retry_delay(attempt: int, retry_after: str | None) -> None:
        if retry_after:
            try:
                delay = float(retry_after)
            except ValueError:
                delay = 0.0
        else:
            delay = min(30.0, 2 ** (attempt - 1)) + random.random() * 0.25
        time.sleep(max(0.0, delay))

    @staticmethod
    def _urlopen_transport(
        request: urllib.request.Request, timeout: float
    ) -> tuple[int, bytes]:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.status), response.read()


class CopyleaksDetector:
    detector_id = "copyleaks"

    def __init__(
        self,
        email: str,
        api_key: str,
        *,
        sensitivity: int = 2,
        sandbox: bool = False,
        explain: bool = False,
        api: JsonApiClient | None = None,
        auth_url: str = "https://id.copyleaks.com/v3/account/login/api",
        base_url: str = "https://api.copyleaks.com/v2/writer-detector",
    ) -> None:
        if not email or not api_key:
            raise ValueError("COPYLEAKS_EMAIL and COPYLEAKS_API_KEY are required")
        if sensitivity not in {1, 2, 3}:
            raise ValueError("Copyleaks sensitivity must be 1, 2, or 3")
        self.email = email
        self.api_key = api_key
        self.sensitivity = sensitivity
        self.sandbox = sandbox
        self.explain = explain
        self.api = api or JsonApiClient()
        self.auth_url = auth_url
        self.base_url = base_url.rstrip("/")
        self._token: str | None = None
        self._token_lock = threading.Lock()

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "Copyleaks synchronous AI Text Detector API",
            "endpoint": f"{self.base_url}/{{scan_id}}/check",
            "sensitivity": self.sensitivity,
            "sandbox": self.sandbox,
            "explain": self.explain,
            "minimum_characters": 255,
            "score_definition": "summary.ai",
            "native_label_definition": "summary.ai >= summary.human",
            "calibration_status": "provider-native-unvalidated-on-this-corpus",
        }

    def detect(self, document: dict[str, Any]) -> dict[str, Any]:
        text = str(document["text"])
        if len(text) < 255:
            raise DetectorError("Copyleaks requires at least 255 characters")
        scan_id = "um-" + sha256_text(str(document["document_id"]))[:32]
        started = time.perf_counter()
        payload, attempts = self.api.request_json(
            url=f"{self.base_url}/{scan_id}/check",
            body={
                "text": text,
                "sandbox": self.sandbox,
                "explain": self.explain,
                "sensitivity": self.sensitivity,
                "language": document["language"],
            },
            headers={"Authorization": f"Bearer {self._access_token()}"},
        )
        summary = payload.get("summary") or {}
        try:
            ai = float(summary["ai"])
            human = float(summary["human"])
        except (KeyError, TypeError, ValueError) as error:
            raise DetectorError(
                "Copyleaks response is missing summary.ai/human"
            ) from error
        return {
            "score": ai,
            "score_name": "summary.ai",
            "score_direction": "higher_is_ai",
            "native_ai_detected": ai >= human,
            "native_label": "AI" if ai >= human else "HUMAN",
            "model_version": payload.get("modelVersion"),
            "request_id": scan_id,
            "attempt_count": attempts,
            "latency_ms": (time.perf_counter() - started) * 1000,
            "billable_units": (payload.get("scannedDocument") or {}).get(
                "actualCredits",
                (payload.get("scannedDocument") or {}).get("credits"),
            ),
            "raw_response": payload,
        }

    def _access_token(self) -> str:
        with self._token_lock:
            if self._token:
                return self._token
            payload, _ = self.api.request_json(
                url=self.auth_url,
                body={"email": self.email, "key": self.api_key},
                headers={},
            )
            token = payload.get("access_token")
            if not isinstance(token, str) or not token:
                raise DetectorError("Copyleaks login response has no access_token")
            self._token = token
            return token


class GptZeroDetector:
    detector_id = "gptzero"

    def __init__(
        self,
        api_key: str,
        *,
        api: JsonApiClient | None = None,
        endpoint: str = "https://api.gptzero.me/v2/predict/text",
    ) -> None:
        if not api_key:
            raise ValueError("GPTZERO_API_KEY is required")
        self.api_key = api_key
        self.api = api or JsonApiClient()
        self.endpoint = endpoint

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "GPTZero v2 single-text API",
            "endpoint": self.endpoint,
            "language_routing": "provider-default",
            "score_definition": "1 - class_probabilities.human",
            "native_label_definition": "document_classification != HUMAN_ONLY",
            "calibration_status": "provider-native-unvalidated-on-this-corpus",
        }

    def detect(self, document: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        payload, attempts = self.api.request_json(
            url=self.endpoint,
            body={"document": str(document["text"])},
            headers={"x-api-key": self.api_key},
        )
        document_payload = self._document_payload(payload)
        classification = document_payload.get("document_classification")
        probabilities = document_payload.get("class_probabilities") or {}
        if classification in {"HUMAN_ONLY", "MIXED", "AI_ONLY"}:
            try:
                human = float(probabilities["human"])
            except (KeyError, TypeError, ValueError) as error:
                raise DetectorError(
                    "GPTZero response is missing class_probabilities.human"
                ) from error
            score = 1.0 - human
            native_ai = classification != "HUMAN_ONLY"
            score_name = "1-class_probabilities.human"
        else:
            legacy = document_payload.get("completely_generated_prob")
            if legacy is None:
                raise DetectorError(
                    "GPTZero response has neither current classification nor legacy score"
                )
            score = float(legacy)
            native_ai = score >= 0.5
            classification = "AI_LEGACY" if native_ai else "HUMAN_LEGACY"
            score_name = "completely_generated_prob"
        return {
            "score": score,
            "score_name": score_name,
            "score_direction": "higher_is_ai",
            "native_ai_detected": native_ai,
            "native_label": classification,
            "model_version": document_payload.get("version")
            or payload.get("model_version"),
            "request_id": payload.get("id") or document_payload.get("id"),
            "attempt_count": attempts,
            "latency_ms": (time.perf_counter() - started) * 1000,
            "billable_units": None,
            "raw_response": payload,
        }

    @staticmethod
    def _document_payload(payload: dict[str, Any]) -> dict[str, Any]:
        documents = payload.get("documents")
        if isinstance(documents, list) and documents and isinstance(documents[0], dict):
            return documents[0]
        if isinstance(payload.get("document"), dict):
            return payload["document"]
        return payload


@dataclass(frozen=True)
class DetectionRunSummary:
    detector_id: str
    requested: int
    succeeded: int
    failed: int
    resumed: int
    output_path: str

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


class DetectionRunner:
    def __init__(
        self,
        detector: DetectorClient,
        *,
        max_workers: int = 2,
        checkpoint_callback: Callable[[], None] | None = None,
        checkpoint_interval: int = 25,
    ) -> None:
        if max_workers < 1:
            raise ValueError("max_workers must be positive")
        if checkpoint_interval < 1:
            raise ValueError("checkpoint_interval must be positive")
        self.detector = detector
        self.max_workers = max_workers
        self.checkpoint_callback = checkpoint_callback
        self.checkpoint_interval = checkpoint_interval

    def run(
        self,
        documents_path: Path,
        output_dir: Path,
        *,
        resume: bool = True,
    ) -> dict[str, Any]:
        documents = read_jsonl(documents_path)
        self._validate_documents(documents)
        output_dir.mkdir(parents=True, exist_ok=True)
        checkpoint_path = output_dir / "checkpoint.jsonl"
        canonical_path = output_dir / "results.jsonl"
        manifest_path = output_dir / "run-manifest.json"
        documents_sha = hashlib.sha256(documents_path.read_bytes()).hexdigest()
        manifest = {
            "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
            "artifact_kind": "generic-detector-run-manifest",
            "detector_id": self.detector.detector_id,
            "detector": self.detector.metadata,
            "documents_sha256": documents_sha,
            "document_count": len(documents),
        }
        if resume and manifest_path.exists():
            existing_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            comparable = {key: existing_manifest.get(key) for key in manifest}
            if comparable != manifest:
                raise ValueError(
                    "Cannot resume a detector run with different corpus/configuration"
                )
        elif not resume:
            for path in (checkpoint_path, canonical_path, manifest_path):
                if path.exists():
                    path.unlink()
        write_json(manifest_path, {**manifest, "created_at": utc_now()})

        existing_rows = read_jsonl(checkpoint_path) if checkpoint_path.exists() else []
        latest: dict[str, dict[str, Any]] = {}
        for row in existing_rows:
            if row.get("detector_id") == self.detector.detector_id:
                latest[str(row.get("document_id"))] = row
        completed = {
            document_id
            for document_id, row in latest.items()
            if row.get("status") == "success"
        }
        by_id = {str(row["document_id"]): row for row in documents}
        for document_id in completed:
            if (
                document_id not in by_id
                or latest[document_id].get("text_sha256")
                != by_id[document_id]["text_sha256"]
            ):
                raise ValueError("Checkpoint does not match the detector corpus")
        pending = [row for row in documents if row["document_id"] not in completed]
        append_lock = threading.Lock()
        persisted_since_callback = 0

        def persist(result: dict[str, Any]) -> None:
            nonlocal persisted_since_callback
            encoded = json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n"
            call_checkpoint = False
            with append_lock:
                with checkpoint_path.open("a", encoding="utf-8") as handle:
                    handle.write(encoded)
                    handle.flush()
                    os.fsync(handle.fileno())
                latest[str(result["document_id"])] = result
                persisted_since_callback += 1
                if persisted_since_callback >= self.checkpoint_interval:
                    persisted_since_callback = 0
                    call_checkpoint = self.checkpoint_callback is not None
            if call_checkpoint and self.checkpoint_callback is not None:
                self.checkpoint_callback()

        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures = {
                pool.submit(self._run_one, document): document for document in pending
            }
            for future in as_completed(futures):
                persist(future.result())

        canonical = [latest[str(row["document_id"])] for row in documents]
        write_jsonl(canonical_path, canonical)
        failed = sum(row["status"] != "success" for row in canonical)
        summary = DetectionRunSummary(
            detector_id=self.detector.detector_id,
            requested=len(documents),
            succeeded=len(documents) - failed,
            failed=failed,
            resumed=len(completed),
            output_path=str(canonical_path),
        ).as_dict()
        write_json(
            manifest_path,
            {**manifest, "created_at": utc_now(), "summary": summary},
        )
        return summary

    def _run_one(self, document: dict[str, Any]) -> dict[str, Any]:
        base = {
            "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
            "artifact_kind": RESULT_KIND,
            "detector_id": self.detector.detector_id,
            "document_id": document["document_id"],
            "text_sha256": document["text_sha256"],
            "language": document["language"],
            "role": document["role"],
            "sample_id": document["sample_id"],
            "pipeline": document["pipeline"],
            "completed_at": utc_now(),
        }
        try:
            return {**base, "status": "success", **self.detector.detect(document)}
        except Exception as error:  # noqa: BLE001 - persist provider failures per row
            return {
                **base,
                "status": "error",
                "error_type": type(error).__name__,
                "error": str(error)[:2000],
            }

    @staticmethod
    def _validate_documents(documents: Sequence[dict[str, Any]]) -> None:
        if not documents:
            raise ValueError("Detector corpus is empty")
        ids = [row.get("document_id") for row in documents]
        if len(set(ids)) != len(ids):
            raise ValueError("Detector corpus contains duplicate document IDs")
        for row in documents:
            text = row.get("text")
            if not isinstance(text, str) or not text:
                raise ValueError("Every detector document must contain text")
            if row.get("text_sha256") != sha256_text(text):
                raise ValueError(f"Text hash mismatch for {row.get('document_id')}")


def binoculars_result(
    document: dict[str, Any],
    *,
    score: float,
    threshold: float,
    latency_ms: float,
    model_version: str,
) -> dict[str, Any]:
    return {
        "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
        "artifact_kind": RESULT_KIND,
        "detector_id": "binoculars",
        "document_id": document["document_id"],
        "text_sha256": document["text_sha256"],
        "language": document["language"],
        "role": document["role"],
        "sample_id": document["sample_id"],
        "pipeline": document["pipeline"],
        "completed_at": utc_now(),
        "status": "success",
        "score": float(score),
        "score_name": "perplexity_over_cross_perplexity",
        "score_direction": "lower_is_ai",
        "native_ai_detected": float(score) < float(threshold),
        "native_label": (
            "Most likely AI-generated"
            if float(score) < float(threshold)
            else "Most likely human-generated"
        ),
        "model_version": model_version,
        "request_id": None,
        "attempt_count": 1,
        "latency_ms": float(latency_ms),
        "billable_units": None,
        "raw_response": {"score": float(score), "threshold": float(threshold)},
    }


class GenericDetectorReport:
    def run(
        self,
        documents_path: Path,
        result_paths: Sequence[Path],
        output_dir: Path,
        *,
        required_detectors: Sequence[str] = (),
        calibration_path: Path | None = None,
    ) -> dict[str, Any]:
        documents = read_jsonl(documents_path)
        document_by_id = {str(row["document_id"]): row for row in documents}
        results: dict[tuple[str, str], dict[str, Any]] = {}
        detector_manifests: dict[str, dict[str, Any]] = {}
        for path in result_paths:
            for row in read_jsonl(path):
                detector_id = str(row.get("detector_id"))
                document_id = str(row.get("document_id"))
                if document_id not in document_by_id:
                    raise ValueError(
                        f"Unknown document in detector results: {document_id}"
                    )
                if row.get("text_sha256") != document_by_id[document_id]["text_sha256"]:
                    raise ValueError(f"Detector result hash mismatch: {document_id}")
                key = (detector_id, document_id)
                if key in results:
                    raise ValueError(f"Duplicate detector result: {key}")
                results[key] = row
            manifest_path = path.parent / "run-manifest.json"
            if manifest_path.exists():
                payload = json.loads(manifest_path.read_text(encoding="utf-8"))
                detector_manifests[str(payload.get("detector_id"))] = payload

        calibration = self._load_calibration(calibration_path)
        self._attach_decisions(results, calibration)
        detectors = sorted({key[0] for key in results})
        missing_required = sorted(set(required_detectors) - set(detectors))
        if missing_required:
            raise ValueError(f"Missing required detector results: {missing_required}")
        joined = []
        for document in documents:
            row = {key: value for key, value in document.items() if key != "text"}
            row["detectors"] = {
                detector: self._compact(
                    results.get((detector, document["document_id"]))
                )
                for detector in detectors
            }
            joined.append(row)

        metrics = {
            detector: self._detector_metrics(detector, documents, results)
            for detector in detectors
        }
        intersection = self._intersection_metrics(detectors, documents, results)
        successful = sum(row.get("status") == "success" for row in results.values())
        summary = {
            "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
            "artifact_kind": "generic-detector-report",
            "created_at": utc_now(),
            "documents_sha256": hashlib.sha256(documents_path.read_bytes()).hexdigest(),
            "document_count": len(documents),
            "detectors": detectors,
            "required_detectors": list(required_detectors),
            "successful_result_count": successful,
            "expected_result_count": len(documents) * len(detectors),
            "complete_matrix": successful == len(documents) * len(detectors),
            "calibration_status": (
                "local-per-detector-language-human-controls"
                if calibration is not None
                else "native-labels;no-local-human-control-fpr-claim"
            ),
            "calibration": (
                {
                    "path": str(calibration_path),
                    "sha256": hashlib.sha256(calibration_path.read_bytes()).hexdigest(),
                    "target_fpr": calibration.get("target_fpr"),
                    "decision_contract": calibration.get("decision_contract"),
                    "detectors": {
                        detector_id: payload.get("languages", {})
                        for detector_id, payload in calibration.get(
                            "detectors", {}
                        ).items()
                    },
                }
                if calibration is not None and calibration_path is not None
                else None
            ),
            "metrics": metrics,
            "all_detector_intersection": intersection,
            "detector_manifests": detector_manifests,
        }
        output_dir.mkdir(parents=True, exist_ok=True)
        write_jsonl(output_dir / "joined-results.jsonl", joined)
        write_json(output_dir / "summary.json", summary)
        (output_dir / "REPORT.md").write_text(self._markdown(summary), encoding="utf-8")
        return summary

    @staticmethod
    def _compact(row: dict[str, Any] | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return {
            key: row.get(key)
            for key in (
                "status",
                "score",
                "score_name",
                "score_direction",
                "native_ai_detected",
                "native_label",
                "calibrated_ai_detected",
                "effective_ai_detected",
                "decision_basis",
                "calibration_threshold",
                "calibration_operator",
                "model_version",
                "latency_ms",
            )
        }

    def _detector_metrics(
        self,
        detector: str,
        documents: Sequence[dict[str, Any]],
        results: dict[tuple[str, str], dict[str, Any]],
    ) -> dict[str, Any]:
        output: dict[str, Any] = {}
        for language in ("en", "it"):
            originals = [
                row
                for row in documents
                if row["language"] == language and row["role"] == "ai_original"
            ]
            original_results = self._successes(detector, originals, results)
            original_by_sample = {
                row["sample_id"]: result for row, result in original_results
            }
            language_payload: dict[str, Any] = {
                "original": self._rate(original_results),
                "pipelines": {},
            }
            for pipeline in EXPECTED_PIPELINES:
                rewrites = [
                    row
                    for row in documents
                    if row["language"] == language
                    and row["role"] == "rewrite"
                    and row["pipeline"] == pipeline
                ]
                rewrite_results = self._successes(detector, rewrites, results)
                pairs = [
                    (document, result, original_by_sample.get(document["sample_id"]))
                    for document, result in rewrite_results
                ]
                conditional = [
                    pair
                    for pair in pairs
                    if pair[2] is not None and self._decision(pair[2]) is True
                ]
                deltas = [
                    self._ai_orientation(detector, pair[1])
                    - self._ai_orientation(detector, pair[2])
                    for pair in pairs
                    if pair[2] is not None
                    and pair[1].get("score") is not None
                    and pair[2].get("score") is not None
                ]
                language_payload["pipelines"][pipeline] = {
                    **self._rate(rewrite_results),
                    "conditional_evasion": self._evasion(conditional),
                    "quality_preserving_conditional_evasion": (
                        self._quality_preserving_evasion(conditional)
                    ),
                    "mean_ai_oriented_score_delta": (
                        statistics.mean(deltas) if deltas else None
                    ),
                }
            output[language] = language_payload
        return output

    @staticmethod
    def _successes(
        detector: str,
        documents: Sequence[dict[str, Any]],
        results: dict[tuple[str, str], dict[str, Any]],
    ) -> list[tuple[dict[str, Any], dict[str, Any]]]:
        output = []
        for document in documents:
            result = results.get((detector, document["document_id"]))
            if result is not None and result.get("status") == "success":
                output.append((document, result))
        return output

    @classmethod
    def _rate(
        cls, rows: Sequence[tuple[dict[str, Any], dict[str, Any]]]
    ) -> dict[str, Any]:
        decided = [
            (document, result)
            for document, result in rows
            if cls._decision(result) is not None
        ]
        detected = sum(cls._decision(result) is True for _, result in decided)
        native_decided = [
            result
            for _, result in rows
            if isinstance(result.get("native_ai_detected"), bool)
        ]
        native_detected = sum(
            result["native_ai_detected"] is True for result in native_decided
        )
        return {
            "rows": len(decided),
            "successful_rows": len(rows),
            "undecided_rows": len(rows) - len(decided),
            "ai_detected": detected,
            "detection_rate": detected / len(decided) if decided else None,
            "detection_rate_wilson_95pct": _wilson_interval(detected, len(decided)),
            "native_rows": len(native_decided),
            "native_ai_detected": native_detected,
            "native_detection_rate": (
                native_detected / len(native_decided) if native_decided else None
            ),
            "native_detection_rate_wilson_95pct": _wilson_interval(
                native_detected, len(native_decided)
            ),
        }

    @classmethod
    def _evasion(
        cls,
        rows: Sequence[tuple[dict[str, Any], dict[str, Any], dict[str, Any] | None]],
    ) -> dict[str, Any]:
        decided = [row for row in rows if cls._decision(row[1]) is not None]
        evaded = sum(cls._decision(result) is False for _, result, _ in decided)
        return {
            "eligible_rows": len(decided),
            "undecided_rows": len(rows) - len(decided),
            "evaded": evaded,
            "rate": evaded / len(decided) if decided else None,
            "rate_wilson_95pct": _wilson_interval(evaded, len(decided)),
        }

    @classmethod
    def _quality_preserving_evasion(
        cls,
        rows: Sequence[tuple[dict[str, Any], dict[str, Any], dict[str, Any] | None]],
    ) -> dict[str, Any]:
        rows = [row for row in rows if cls._decision(row[1]) is not None]
        quality_passed = sum(
            bool(document.get("quality_pass")) for document, _, _ in rows
        )
        joint_success = sum(
            bool(document.get("quality_pass")) and cls._decision(result) is False
            for document, result, _ in rows
        )
        return {
            "eligible_rows": len(rows),
            "quality_passed": quality_passed,
            "evaded_and_quality_passed": joint_success,
            "rate": joint_success / len(rows) if rows else None,
            "rate_wilson_95pct": _wilson_interval(joint_success, len(rows)),
        }

    @staticmethod
    def _ai_orientation(detector: str, result: dict[str, Any]) -> float:
        from .detector_calibration import score_direction

        value = float(result["score"])
        return -value if score_direction(result, detector) == "lower_is_ai" else value

    def _intersection_metrics(
        self,
        detectors: Sequence[str],
        documents: Sequence[dict[str, Any]],
        results: dict[tuple[str, str], dict[str, Any]],
    ) -> dict[str, Any]:
        output: dict[str, Any] = {}
        if not detectors:
            return output
        for language in ("en", "it"):
            output[language] = {}
            for pipeline in EXPECTED_PIPELINES:
                eligible = [
                    row
                    for row in documents
                    if row["language"] == language
                    and row["role"] == "rewrite"
                    and row["pipeline"] == pipeline
                    and all(
                        results.get((detector, row["document_id"]), {}).get("status")
                        == "success"
                        and self._decision(
                            results.get((detector, row["document_id"]), {})
                        )
                        is not None
                        for detector in detectors
                    )
                ]
                passed = sum(
                    all(
                        self._decision(results[(detector, row["document_id"])]) is False
                        for detector in detectors
                    )
                    for row in eligible
                )
                output[language][pipeline] = {
                    "rows": len(eligible),
                    "passed_all_detectors": passed,
                    "rate": passed / len(eligible) if eligible else None,
                    "rate_wilson_95pct": _wilson_interval(passed, len(eligible)),
                }
        return output

    @staticmethod
    def _markdown(summary: dict[str, Any]) -> str:
        lines = [
            "# Generic AI detector matrix",
            "",
            f"Documents: **{summary['document_count']}**. Detectors: "
            + ", ".join(summary["detectors"])
            + ".",
            "",
            (
                "> Decisions use detector/language thresholds fitted on independent "
                "human controls; evaluation-control FPR is reported in the calibration "
                "artifact."
                if summary.get("calibration")
                else "> These are native detector labels, not TPR at a locally calibrated "
                "FPR. Without a human-control calibration artifact this report makes no "
                "FPR claim."
            ),
            "",
        ]
        calibration = summary.get("calibration")
        if calibration:
            lines.extend(
                [
                    "## Human-control calibration audit",
                    "",
                    "| Detector | Language | Rule | Calibration FPR | Evaluation FPR |",
                    "| --- | --- | ---: | ---: | ---: |",
                ]
            )
            for detector_id, languages in calibration.get("detectors", {}).items():
                for language, cell in languages.items():
                    rule = f"score {cell['operator']} {cell['threshold']:.6g}"
                    calibration_fpr = _format_fraction(
                        cell["calibration_false_positives"],
                        cell["calibration_rows"],
                    )
                    evaluation_fpr = _format_fraction(
                        cell["evaluation_false_positives"], cell["evaluation_rows"]
                    )
                    lines.append(
                        f"| {detector_id} | {language} | {rule} | "
                        f"{calibration_fpr} | {evaluation_fpr} |"
                    )
            lines.append("")
            stress_rows = [
                (detector_id, language, control_group, stress)
                for detector_id, languages in calibration.get("detectors", {}).items()
                for language, cell in languages.items()
                for control_group, stress in cell.get("stress_evaluations", {}).items()
            ]
            if stress_rows:
                lines.extend(
                    [
                        "### Grouped human stress evaluations",
                        "",
                        "| Detector | Language | Control group | Passage FPR | Groups with any false positive | Complete |",
                        "| --- | --- | --- | ---: | ---: | ---: |",
                    ]
                )
                for detector_id, language, control_group, stress in stress_rows:
                    passage_fpr = _format_fraction(
                        stress["false_positives"], stress["scored_rows"]
                    )
                    grouped_fpr = _format_fraction(
                        stress["groups_with_any_false_positive"],
                        stress["fully_scored_groups"],
                    )
                    lines.append(
                        f"| {detector_id} | {language} | {control_group} | "
                        f"{passage_fpr} | {grouped_fpr} | "
                        f"{'yes' if stress['complete'] else 'no'} |"
                    )
                lines.append("")
        for detector, by_language in summary["metrics"].items():
            lines.extend([f"## {detector}", ""])
            for language, payload in by_language.items():
                original = payload["original"]
                lines.extend(
                    [
                        f"### {language}",
                        "",
                        f"Original AI detection: {original['ai_detected']}/{original['rows']}.",
                        "",
                        "| Pipeline | Detected after rewrite | Conditional evasion | Quality-preserving evasion |",
                        "| --- | ---: | ---: | ---: |",
                    ]
                )
                for pipeline, metrics in payload["pipelines"].items():
                    detection = _format_fraction(
                        metrics["ai_detected"], metrics["rows"]
                    )
                    evasion = _format_rate(metrics["conditional_evasion"])
                    quality = _format_rate(
                        metrics["quality_preserving_conditional_evasion"]
                    )
                    lines.append(
                        f"| {pipeline} | {detection} | {evasion} | {quality} |"
                    )
                lines.append("")
        return "\n".join(lines).rstrip() + "\n"

    @staticmethod
    def _load_calibration(path: Path | None) -> dict[str, Any] | None:
        if path is None:
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
        if payload.get("artifact_kind") != "unmarker-generic-detector-calibration":
            raise ValueError("Invalid generic-detector calibration artifact")
        return payload

    @staticmethod
    def _attach_decisions(
        results: dict[tuple[str, str], dict[str, Any]],
        calibration: dict[str, Any] | None,
    ) -> None:
        from .detector_calibration import apply_threshold, score_direction

        for (detector_id, _), result in results.items():
            result["effective_ai_detected"] = None
            result["decision_basis"] = "unavailable"
            if result.get("status") != "success":
                continue
            language = str(result.get("language"))
            detector_calibration = ((calibration or {}).get("detectors") or {}).get(
                detector_id
            )
            threshold = (detector_calibration or {}).get("languages", {}).get(language)
            if calibration is not None and threshold is None:
                raise ValueError(
                    f"Calibration has no {detector_id}/{language} threshold"
                )
            if threshold is not None and result.get("score") is not None:
                expected_direction = detector_calibration.get("score_direction")
                actual_direction = score_direction(result, detector_id)
                if actual_direction != expected_direction:
                    raise ValueError(
                        f"Calibration score direction mismatch for {detector_id}"
                    )
                score_names = detector_calibration.get("score_names") or []
                if score_names and result.get("score_name") not in score_names:
                    raise ValueError(
                        f"Calibration score name mismatch for {detector_id}"
                    )
                model_versions = detector_calibration.get("model_versions") or []
                if model_versions and result.get("model_version") not in model_versions:
                    raise ValueError(
                        f"Calibration model version mismatch for {detector_id}"
                    )
                decision = apply_threshold(
                    float(result["score"]),
                    str(threshold["operator"]),
                    float(threshold["threshold"]),
                )
                result["calibrated_ai_detected"] = decision
                result["effective_ai_detected"] = decision
                result["decision_basis"] = "calibrated_human_controls"
                result["calibration_threshold"] = threshold["threshold"]
                result["calibration_operator"] = threshold["operator"]
            elif isinstance(result.get("native_ai_detected"), bool):
                result["effective_ai_detected"] = result["native_ai_detected"]
                result["decision_basis"] = "native"

    @staticmethod
    def _decision(result: dict[str, Any]) -> bool | None:
        decision = result.get("effective_ai_detected")
        if isinstance(decision, bool):
            return decision
        native = result.get("native_ai_detected")
        return native if isinstance(native, bool) else None


def _format_fraction(numerator: int, denominator: int) -> str:
    if not denominator:
        return "n/a"
    return f"{numerator}/{denominator} ({numerator / denominator:.1%})"


def _format_rate(payload: dict[str, Any]) -> str:
    rate = payload.get("rate")
    if rate is None:
        return "n/a"
    successes = payload.get("evaded", payload.get("evaded_and_quality_passed"))
    return f"{successes}/{payload['eligible_rows']} ({rate:.1%})"


def _wilson_interval(
    successes: int, total: int, z: float = 1.959963984540054
) -> list[float] | None:
    if total == 0:
        return None
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    margin = (
        z
        * ((proportion * (1 - proportion) / total + z * z / (4 * total * total)) ** 0.5)
        / denominator
    )
    return [max(0.0, center - margin), min(1.0, center + margin)]
