from __future__ import annotations

import hashlib
import threading
import time
from pathlib import Path
from typing import Any

RADAR_MODEL = "TrustSafeAI/RADAR-Vicuna-7B"
RADAR_REVISION = "4ff1f23a69a36aa1df47b0933be6279f1b896c9b"
XLMR_BASE_MODEL = "FacebookAI/xlm-roberta-large"
XLMR_BASE_REVISION = "c23d21b0620b635a76227c604d44e43a9f0ee389"


def resolve_device(requested: str) -> str:
    import torch

    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class SequenceClassificationDetector:
    def __init__(
        self,
        *,
        detector_id: str,
        model_name_or_path: str,
        revision: str | None,
        ai_label_index: int | None,
        device: str = "auto",
        max_length: int = 512,
        implementation: str,
    ) -> None:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self.detector_id = detector_id
        self.model_name_or_path = model_name_or_path
        self.revision = revision
        self.device = resolve_device(device)
        self.max_length = max_length
        self.implementation = implementation
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name_or_path, revision=revision
        )
        self.model = AutoModelForSequenceClassification.from_pretrained(
            model_name_or_path, revision=revision
        ).to(self.device)
        self.model.eval()
        self.torch = torch
        self.ai_label_index = (
            ai_label_index
            if ai_label_index is not None
            else self._infer_ai_label_index(self.model.config)
        )
        self._lock = threading.Lock()
        self._model_version = self._version()

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": self.implementation,
            "model": self.model_name_or_path,
            "revision": self.revision,
            "model_version": self._model_version,
            "ai_label_index": self.ai_label_index,
            "max_length": self.max_length,
            "device": self.device,
            "score_definition": "softmax_probability_of_ai_class",
            "score_direction": "higher_is_ai",
            "native_label_definition": "AI probability >= 0.5",
            "calibration_status": "requires-language-specific-human-controls",
        }

    def detect(self, document: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        with self._lock, self.torch.inference_mode():
            encoded = self.tokenizer(
                str(document["text"]),
                return_tensors="pt",
                truncation=True,
                max_length=self.max_length,
            )
            encoded = {key: value.to(self.device) for key, value in encoded.items()}
            logits = self.model(**encoded).logits[0]
            probability = float(
                self.torch.softmax(logits.float(), dim=-1)[self.ai_label_index]
                .detach()
                .cpu()
            )
            token_count = int(encoded["input_ids"].shape[-1])
        detected = probability >= 0.5
        return {
            "score": probability,
            "score_name": "ai_class_probability",
            "score_direction": "higher_is_ai",
            "native_ai_detected": detected,
            "native_label": "AI" if detected else "HUMAN",
            "model_version": self._model_version,
            "request_id": None,
            "attempt_count": 1,
            "latency_ms": (time.perf_counter() - started) * 1000,
            "billable_units": None,
            "raw_response": {
                "ai_probability": probability,
                "ai_label_index": self.ai_label_index,
                "input_token_count": token_count,
                "truncated": token_count >= self.max_length,
            },
        }

    def _version(self) -> str:
        path = Path(self.model_name_or_path)
        if path.exists():
            manifest = path / "training-manifest.json"
            suffix = (
                hashlib.sha256(manifest.read_bytes()).hexdigest()[:12]
                if manifest.exists()
                else "local"
            )
            return f"{self.detector_id}:{path.name}@{suffix}"
        return f"{self.model_name_or_path}@{(self.revision or 'unpinned')[:12]}"

    @staticmethod
    def _infer_ai_label_index(config: Any) -> int:
        label2id = {
            str(key).lower(): int(value)
            for key, value in (getattr(config, "label2id", {}) or {}).items()
        }
        for label in ("machine", "ai", "generated", "label_1"):
            if label in label2id:
                return label2id[label]
        if int(getattr(config, "num_labels", 0)) == 2:
            return 1
        raise ValueError("Cannot infer the model's AI class index")


def radar_detector(*, device: str = "auto") -> SequenceClassificationDetector:
    return SequenceClassificationDetector(
        detector_id="radar",
        model_name_or_path=RADAR_MODEL,
        revision=RADAR_REVISION,
        ai_label_index=0,
        device=device,
        max_length=512,
        implementation="official IBM RADAR released classifier",
    )


def xlmr_detector(
    model_name_or_path: str, *, device: str = "auto"
) -> SequenceClassificationDetector:
    return SequenceClassificationDetector(
        detector_id="xlmr_mgt",
        model_name_or_path=model_name_or_path,
        revision=None,
        ai_label_index=None,
        device=device,
        max_length=512,
        implementation=(
            "XLM-R large fine-tuned on the pinned COLING 2025 multilingual MGT corpus"
        ),
    )
