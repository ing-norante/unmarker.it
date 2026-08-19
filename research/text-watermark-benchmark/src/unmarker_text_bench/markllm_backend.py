from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Any

from .markllm_gate import DetectionResult


class OfficialMarkLLMBackend:
    """Thin optional adapter over the official THU-BPM/MarkLLM source tree.

    Heavy dependencies are imported only when this backend is instantiated, so
    the dependency-free Gate 1 suite remains unchanged.
    """

    def __init__(
        self,
        markllm_root: Path,
        model_name: str,
        algorithms: tuple[str, ...],
        device: str = "auto",
        max_new_tokens: int = 192,
        min_new_tokens: int = 80,
        temperature: float = 0.8,
        top_p: float = 0.95,
        top_k: int = 50,
    ) -> None:
        self.markllm_root = markllm_root.resolve()
        self.model_name = model_name
        self.algorithms = algorithms
        self.max_new_tokens = max_new_tokens
        self.min_new_tokens = min_new_tokens
        self.temperature = temperature
        self.top_p = top_p
        self.top_k = top_k
        self._validate_source_tree()
        if str(self.markllm_root) not in sys.path:
            sys.path.insert(0, str(self.markllm_root))

        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer, LogitsProcessorList
            from utils.transformers_config import TransformersConfig
            from watermark.auto_watermark import AutoWatermark
        except ImportError as error:
            raise RuntimeError(
                "MarkLLM Gate 2 dependencies are missing. Create the isolated environment "
                "described in MARKLLM.md before running this backend."
            ) from error

        self.torch = torch
        self.LogitsProcessorList = LogitsProcessorList
        self.AutoWatermark = AutoWatermark
        self.device = self._resolve_device(device)
        dtype = torch.float16 if self.device in {"mps", "cuda"} else torch.float32
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        if self.tokenizer.pad_token_id is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        try:
            self.model = AutoModelForCausalLM.from_pretrained(model_name, dtype=dtype)
        except TypeError:
            # Transformers 4.x used torch_dtype; 5.x renamed the argument.
            self.model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype=dtype)
        self.model.to(self.device)
        self.model.eval()

        self.generation_kwargs = {
            "max_new_tokens": max_new_tokens,
            "min_new_tokens": min_new_tokens,
            "do_sample": True,
            "temperature": temperature,
            "top_p": top_p,
            "top_k": top_k,
            "no_repeat_ngram_size": 4,
            "pad_token_id": self.tokenizer.pad_token_id,
        }
        transformers_config = TransformersConfig(
            model=self.model,
            tokenizer=self.tokenizer,
            vocab_size=self.model.config.vocab_size,
            device=self.device,
            **self.generation_kwargs,
        )
        self.watermarks: dict[str, Any] = {}
        for algorithm in algorithms:
            config_path = self.markllm_root / "config" / f"{algorithm}.json"
            if not config_path.exists():
                raise FileNotFoundError(f"Missing MarkLLM algorithm config: {config_path}")
            self.watermarks[algorithm] = AutoWatermark.load(
                algorithm,
                algorithm_config=str(config_path),
                transformers_config=transformers_config,
            )

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "THU-BPM/MarkLLM",
            "source_commit": self._source_commit(),
            "source_root": str(self.markllm_root),
            "model": self.model_name,
            "device": self.device,
            "max_new_tokens": self.max_new_tokens,
            "min_new_tokens": self.min_new_tokens,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "top_k": self.top_k,
        }

    def generate_unwatermarked(self, prompt: str, seed: int) -> str:
        return self._generate(prompt, seed, logits_processor=None)

    def generate_watermarked(self, algorithm: str, prompt: str, seed: int) -> str:
        watermark = self.watermarks[algorithm]
        processor = watermark.logits_processor
        if hasattr(processor, "state"):
            processor.state = None
        return self._generate(
            prompt,
            seed,
            logits_processor=self.LogitsProcessorList([processor]),
        )

    def detect(self, algorithm: str, text: str) -> DetectionResult:
        result = self.watermarks[algorithm].detect_watermark(text)
        return DetectionResult(bool(result["is_watermarked"]), float(result["score"]))

    def count_tokens(self, text: str) -> int:
        return len(self.tokenizer(text, add_special_tokens=False)["input_ids"])

    def _generate(self, prompt: str, seed: int, logits_processor: Any | None) -> str:
        self._seed(seed)
        encoded = self.tokenizer(prompt, return_tensors="pt", add_special_tokens=True).to(self.device)
        input_length = encoded["input_ids"].shape[-1]
        kwargs = dict(self.generation_kwargs)
        if logits_processor is not None:
            kwargs["logits_processor"] = logits_processor
        with self.torch.inference_mode():
            generated = self.model.generate(**encoded, **kwargs)
        continuation_ids = generated[0, input_length:]
        return self.tokenizer.decode(continuation_ids, skip_special_tokens=True).strip()

    def _seed(self, seed: int) -> None:
        self.torch.manual_seed(seed)
        if self.device == "cuda":
            self.torch.cuda.manual_seed_all(seed)
        elif self.device == "mps" and hasattr(self.torch, "mps"):
            self.torch.mps.manual_seed(seed)

    def _resolve_device(self, requested: str) -> str:
        if requested != "auto":
            return requested
        if self.torch.cuda.is_available():
            return "cuda"
        if self.torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _validate_source_tree(self) -> None:
        expected = (
            self.markllm_root / "watermark" / "auto_watermark.py",
            self.markllm_root / "utils" / "transformers_config.py",
            self.markllm_root / "config" / "KGW.json",
        )
        missing = [str(path) for path in expected if not path.exists()]
        if missing:
            raise FileNotFoundError(
                "The supplied directory is not an official MarkLLM source checkout; "
                f"missing: {missing}"
            )

    def _source_commit(self) -> str | None:
        try:
            return subprocess.run(
                ["git", "-C", str(self.markllm_root), "rev-parse", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            return None
