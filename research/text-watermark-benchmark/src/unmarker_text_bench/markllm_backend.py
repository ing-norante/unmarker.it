from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from .markllm_gate import DetectionResult

_P_VALUE_ALGORITHMS = {"EXP", "EXPGumbel", "EXPEdit", "ITSEdit"}
_NATIVE_GENERATION_ALGORITHMS = {"EXP", "EXPGumbel"}
_DEFAULT_EXPGUMBEL_MEMORY_LIMIT_BYTES = 16 * 1024**3


def normalize_detection_result(
    algorithm: str, result: dict[str, Any]
) -> DetectionResult:
    """Put all detector scores on the common higher-means-more-watermarked axis."""

    raw_score = float(result["score"])
    if not math.isfinite(raw_score):
        raise ValueError(f"{algorithm} returned a non-finite detector score")
    if algorithm in _P_VALUE_ALGORITHMS:
        if not 0.0 <= raw_score <= 1.0:
            raise ValueError(f"{algorithm} returned an invalid p-value: {raw_score}")
        bounded = min(max(raw_score, 1e-300), 1.0)
        score = -math.log10(bounded)
    else:
        score = raw_score
    return DetectionResult(bool(result["is_watermarked"]), score)


def markllm_algorithm_capabilities(
    algorithms: tuple[str, ...],
    vocab_size: int,
    expgumbel_prefix_length: int = 2,
    expgumbel_memory_limit_bytes: int = _DEFAULT_EXPGUMBEL_MEMORY_LIMIT_BYTES,
) -> dict[str, dict[str, Any]]:
    capabilities: dict[str, dict[str, Any]] = {}
    for algorithm in algorithms:
        if algorithm != "EXPGumbel":
            capabilities[algorithm] = {
                "supported": True,
                "official_generation": (
                    "native"
                    if algorithm in _NATIVE_GENERATION_ALGORITHMS
                    else "logits_processor"
                ),
            }
            continue
        # The pinned official implementation materializes both a float32 uniform
        # matrix and its Gumbel transform with shape (V * prefix, V).
        estimated_bytes = 2 * vocab_size * expgumbel_prefix_length * vocab_size * 4
        capabilities[algorithm] = {
            "supported": estimated_bytes <= expgumbel_memory_limit_bytes,
            "official_generation": "native",
            "minimum_dense_table_bytes": estimated_bytes,
            "memory_limit_bytes": expgumbel_memory_limit_bytes,
            "reason": (
                None
                if estimated_bytes <= expgumbel_memory_limit_bytes
                else "official MarkLLM allocates dense uniform and Gumbel VxV tables"
            ),
        }
    return capabilities


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
        config_overrides: dict[str, dict[str, Any]] | None = None,
        generated_config_dir: Path | None = None,
        expgumbel_memory_limit_bytes: int = _DEFAULT_EXPGUMBEL_MEMORY_LIMIT_BYTES,
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
        self.config_overrides = config_overrides or {}
        self._temporary_config_dir = (
            tempfile.TemporaryDirectory(prefix="unmarker-markllm-config-")
            if generated_config_dir is None
            else None
        )
        self.generated_config_dir = generated_config_dir or Path(
            self._temporary_config_dir.name
        )
        self.expgumbel_memory_limit_bytes = expgumbel_memory_limit_bytes
        self._validate_source_tree()
        if str(self.markllm_root) not in sys.path:
            sys.path.insert(0, str(self.markllm_root))

        try:
            import torch
            from transformers import (
                AutoConfig,
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
        model_config = AutoConfig.from_pretrained(model_name, revision=model_revision)
        self.algorithm_capabilities = markllm_algorithm_capabilities(
            algorithms,
            int(model_config.vocab_size),
            expgumbel_memory_limit_bytes=expgumbel_memory_limit_bytes,
        )
        unsupported = {
            algorithm: capability
            for algorithm, capability in self.algorithm_capabilities.items()
            if not capability["supported"]
        }
        if unsupported:
            details = "; ".join(
                f"{algorithm}: needs at least {capability['minimum_dense_table_bytes'] / 1024**3:.1f} GiB"
                for algorithm, capability in unsupported.items()
            )
            raise ValueError(
                "Official MarkLLM algorithm is unsafe for this vocabulary before allocation: "
                f"{details}. Use EXP for the same exponential/Gumbel watermark family or a "
                "model with a much smaller vocabulary."
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
        self.effective_config_paths: dict[str, Path] = {}
        for algorithm in algorithms:
            source_config_path = self.markllm_root / "config" / f"{algorithm}.json"
            if not source_config_path.exists():
                raise FileNotFoundError(
                    f"Missing MarkLLM algorithm config: {source_config_path}"
                )
            config_path = self._materialize_config(algorithm, source_config_path)
            self.effective_config_paths[algorithm] = config_path
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
            "score_transforms": {
                algorithm: (
                    "negative_log10_p_value"
                    if algorithm in _P_VALUE_ALGORITHMS
                    else "identity"
                )
                for algorithm in self.algorithms
            },
            "algorithm_capabilities": self.algorithm_capabilities,
            "config_overrides": self.config_overrides,
            "runtime": self._runtime_metadata(),
            "algorithm_config_sha256": {
                algorithm: self._sha256(self.effective_config_paths[algorithm])
                for algorithm in self.algorithms
            },
        }

    def generate_unwatermarked(self, prompt: str, seed: int) -> str:
        return self._generate(prompt, seed, logits_processor=None)

    def generate_watermarked(self, algorithm: str, prompt: str, seed: int) -> str:
        watermark = self.watermarks[algorithm]
        if algorithm in _NATIVE_GENERATION_ALGORITHMS:
            self._seed(seed)
            rendered_prompt, _ = self._render_prompt(prompt)
            generated = watermark.generate_watermarked_text(rendered_prompt).strip()
            prompt_ids = self.tokenizer.encode(
                rendered_prompt, add_special_tokens=True, return_tensors="pt"
            )[0]
            decoded_prompt = self.tokenizer.decode(
                prompt_ids, skip_special_tokens=True
            ).strip()
            if not generated.startswith(decoded_prompt):
                raise ValueError(
                    f"Could not remove the prompt from native {algorithm} generation"
                )
            continuation = generated[len(decoded_prompt) :].strip()
            if not continuation:
                raise ValueError(
                    f"Native {algorithm} generation returned no continuation"
                )
            return continuation
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
        return normalize_detection_result(algorithm, result)

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

    def _materialize_config(self, algorithm: str, source: Path) -> Path:
        overrides = self.config_overrides.get(algorithm)
        if not overrides:
            return source
        payload = json.loads(source.read_text(encoding="utf-8"))
        payload.update(overrides)
        self.generated_config_dir.mkdir(parents=True, exist_ok=True)
        target = self.generated_config_dir / f"{algorithm}.json"
        target.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return target

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
        expgumbel_memory_limit_bytes: int = _DEFAULT_EXPGUMBEL_MEMORY_LIMIT_BYTES,
    ) -> None:
        self.markllm_root = markllm_root.resolve()
        self.tokenizer_name = tokenizer_name
        self.tokenizer_revision = tokenizer_revision
        self.algorithms = algorithms
        self.device = device
        self.config_overrides = config_overrides or {}
        self.generated_config_dir = generated_config_dir
        self.expgumbel_memory_limit_bytes = expgumbel_memory_limit_bytes
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
        self.algorithm_capabilities = markllm_algorithm_capabilities(
            algorithms,
            self.vocab_size,
            expgumbel_memory_limit_bytes=expgumbel_memory_limit_bytes,
        )
        unsupported = {
            algorithm: capability
            for algorithm, capability in self.algorithm_capabilities.items()
            if not capability["supported"]
        }
        if unsupported:
            details = "; ".join(
                f"{algorithm}: needs at least {capability['minimum_dense_table_bytes'] / 1024**3:.1f} GiB"
                for algorithm, capability in unsupported.items()
            )
            raise ValueError(
                "Official MarkLLM detector is unsafe for this vocabulary before allocation: "
                f"{details}."
            )
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
            "algorithm_capabilities": self.algorithm_capabilities,
            "score_transforms": {
                algorithm: (
                    "negative_log10_p_value"
                    if algorithm in _P_VALUE_ALGORITHMS
                    else "identity"
                )
                for algorithm in self.algorithms
            },
            "algorithm_config_sha256": {
                algorithm: self._sha256(
                    self.markllm_root / "config" / f"{algorithm}.json"
                )
                for algorithm in self.algorithms
            },
        }

    def detect(self, algorithm: str, text: str) -> DetectionResult:
        result = self.watermarks[algorithm].detect_watermark(text)
        return normalize_detection_result(algorithm, result)

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
