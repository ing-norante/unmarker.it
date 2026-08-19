from __future__ import annotations

import hashlib
import importlib.metadata
import json
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
        model_revision: str | None = None,
        device: str = "auto",
        max_new_tokens: int = 192,
        min_new_tokens: int = 80,
        temperature: float = 0.7,
        top_p: float = 0.8,
        top_k: int = 20,
        use_chat_template: bool = True,
        enable_thinking: bool = False,
    ) -> None:
        self.markllm_root = markllm_root.resolve()
        self.model_name = model_name
        self.model_revision = model_revision
        self.algorithms = algorithms
        self.max_new_tokens = max_new_tokens
        self.min_new_tokens = min_new_tokens
        self.temperature = temperature
        self.top_p = top_p
        self.top_k = top_k
        self.use_chat_template = use_chat_template
        self.enable_thinking = enable_thinking
        self._validate_source_tree()
        if str(self.markllm_root) not in sys.path:
            sys.path.insert(0, str(self.markllm_root))

        try:
            import torch
            from transformers import (
                AutoModelForCausalLM,
                AutoTokenizer,
                LogitsProcessorList,
            )
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
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name, revision=model_revision
        )
        if self.tokenizer.pad_token_id is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        model_kwargs: dict[str, Any] = {
            "revision": model_revision,
            "dtype": dtype,
        }
        if self.device == "cuda":
            model_kwargs["device_map"] = {"": "cuda"}
        try:
            self.model = AutoModelForCausalLM.from_pretrained(
                model_name,
                **model_kwargs,
            )
        except TypeError:
            # Transformers 4.x used torch_dtype; 5.x renamed the argument.
            model_kwargs["torch_dtype"] = model_kwargs.pop("dtype")
            self.model = AutoModelForCausalLM.from_pretrained(
                model_name,
                **model_kwargs,
            )
        if self.device != "cuda":
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
                raise FileNotFoundError(
                    f"Missing MarkLLM algorithm config: {config_path}"
                )
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
            "model_revision": self.model_revision,
            "vocab_size": int(self.model.config.vocab_size),
            "tokenizer_length": len(self.tokenizer),
            "device": self.device,
            "max_new_tokens": self.max_new_tokens,
            "min_new_tokens": self.min_new_tokens,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "top_k": self.top_k,
            "use_chat_template": self.use_chat_template,
            "enable_thinking": self.enable_thinking,
            "runtime": self._runtime_metadata(),
            "algorithm_config_sha256": {
                algorithm: self._sha256(
                    self.markllm_root / "config" / f"{algorithm}.json"
                )
                for algorithm in self.algorithms
            },
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
        rendered_prompt, add_special_tokens = self._render_prompt(prompt)
        encoded = self.tokenizer(
            rendered_prompt,
            return_tensors="pt",
            add_special_tokens=add_special_tokens,
        ).to(self.device)
        input_length = encoded["input_ids"].shape[-1]
        kwargs = dict(self.generation_kwargs)
        if logits_processor is not None:
            kwargs["logits_processor"] = logits_processor
        with self.torch.inference_mode():
            generated = self.model.generate(**encoded, **kwargs)
        continuation_ids = generated[0, input_length:]
        return self.tokenizer.decode(continuation_ids, skip_special_tokens=True).strip()

    def _render_prompt(self, prompt: str) -> tuple[str, bool]:
        if not self.use_chat_template:
            return prompt, True
        if not getattr(self.tokenizer, "chat_template", None):
            raise ValueError(
                f"Model {self.model_name!r} has no chat template; use_chat_template cannot be enabled"
            )
        rendered = self.tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=self.enable_thinking,
        )
        return rendered, False

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

    @staticmethod
    def _sha256(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def _runtime_metadata(self) -> dict[str, Any]:
        packages = {}
        for name in ("torch", "transformers", "numpy", "scikit-learn"):
            try:
                packages[name] = importlib.metadata.version(name)
            except importlib.metadata.PackageNotFoundError:
                packages[name] = None
        cuda_name = None
        if self.device == "cuda" and self.torch.cuda.is_available():
            cuda_name = self.torch.cuda.get_device_name(0)
        return {
            "python": sys.version.split()[0],
            "packages": packages,
            "cuda_version": self.torch.version.cuda,
            "accelerator": cuda_name,
        }


class OfficialMarkLLMDetectorBackend:
    """Detector-only adapter that avoids loading the generation model weights."""

    def __init__(
        self,
        markllm_root: Path,
        tokenizer_name: str,
        algorithms: tuple[str, ...],
        tokenizer_revision: str | None = None,
        device: str = "cpu",
        config_overrides: dict[str, dict[str, Any]] | None = None,
        generated_config_dir: Path | None = None,
    ) -> None:
        self.markllm_root = markllm_root.resolve()
        self.tokenizer_name = tokenizer_name
        self.tokenizer_revision = tokenizer_revision
        self.algorithms = algorithms
        self.device = device
        self.config_overrides = config_overrides or {}
        self.generated_config_dir = generated_config_dir
        self._validate_source_tree()
        if str(self.markllm_root) not in sys.path:
            sys.path.insert(0, str(self.markllm_root))

        try:
            from transformers import AutoConfig, AutoTokenizer
            from utils.transformers_config import TransformersConfig
            from watermark.auto_watermark import AutoWatermark
        except ImportError as error:
            raise RuntimeError("MarkLLM detector dependencies are missing") from error

        self.tokenizer = AutoTokenizer.from_pretrained(
            tokenizer_name,
            revision=tokenizer_revision,
        )
        model_config = AutoConfig.from_pretrained(
            tokenizer_name,
            revision=tokenizer_revision,
        )
        self.vocab_size = int(model_config.vocab_size)
        transformers_config = TransformersConfig(
            model=None,
            tokenizer=self.tokenizer,
            vocab_size=self.vocab_size,
            device=device,
        )
        self.watermarks: dict[str, Any] = {}
        config_root = generated_config_dir or (self.markllm_root / ".generated-config")
        for algorithm in algorithms:
            source = self.markllm_root / "config" / f"{algorithm}.json"
            if algorithm in self.config_overrides:
                payload = json.loads(source.read_text(encoding="utf-8"))
                payload.update(self.config_overrides[algorithm])
                config_root.mkdir(parents=True, exist_ok=True)
                target = config_root / f"{algorithm}.json"
                target.write_text(
                    json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
                config_path = target
            else:
                config_path = source
            self.watermarks[algorithm] = AutoWatermark.load(
                algorithm,
                algorithm_config=str(config_path),
                transformers_config=transformers_config,
            )

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "THU-BPM/MarkLLM detector-only",
            "source_commit": self._source_commit(),
            "tokenizer": self.tokenizer_name,
            "tokenizer_revision": self.tokenizer_revision,
            "device": self.device,
            "vocab_size": self.vocab_size,
            "tokenizer_length": len(self.tokenizer),
            "algorithms": list(self.algorithms),
            "config_overrides": self.config_overrides,
            "algorithm_config_sha256": {
                algorithm: self._sha256(
                    self.markllm_root / "config" / f"{algorithm}.json"
                )
                for algorithm in self.algorithms
            },
        }

    def detect(self, algorithm: str, text: str) -> DetectionResult:
        result = self.watermarks[algorithm].detect_watermark(text)
        return DetectionResult(bool(result["is_watermarked"]), float(result["score"]))

    def count_tokens(self, text: str) -> int:
        return len(self.tokenizer(text, add_special_tokens=False)["input_ids"])

    def _validate_source_tree(self) -> None:
        expected = (
            self.markllm_root / "watermark" / "auto_watermark.py",
            self.markllm_root / "utils" / "transformers_config.py",
        )
        missing = [str(path) for path in expected if not path.exists()]
        if missing:
            raise FileNotFoundError(
                f"Invalid MarkLLM source checkout; missing: {missing}"
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

    @staticmethod
    def _sha256(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()
