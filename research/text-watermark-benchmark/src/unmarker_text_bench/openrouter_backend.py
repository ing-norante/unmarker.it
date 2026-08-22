from __future__ import annotations

import json
import os
import random
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

DEFAULT_OPENROUTER_MODEL = "qwen/qwen3-235b-a22b-2507"
DEFAULT_OPENROUTER_TOKENIZER = "Qwen/Qwen3-235B-A22B-Instruct-2507"
DEFAULT_OPENROUTER_TOKENIZER_REVISION = "ac9c66cc9b46af7306746a9250f23d47083d689e"


@dataclass(frozen=True)
class RewriteResponse:
    text: str
    request_id: str | None
    model: str
    provider: str | None
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float | None
    latency_ms: float
    reasoning_tokens: int = 0
    finish_reason: str | None = None
    request_ids: tuple[str, ...] = ()
    attempt_count: int = 1
    length_retry_count: int = 0
    max_tokens_used: int | None = None


class OpenRouterError(RuntimeError):
    pass


Transport = Callable[[urllib.request.Request, float], tuple[int, bytes]]


class OpenRouterRewriter:
    """Minimal, retrying OpenRouter chat-completions client.

    Provider routing is intentionally fixed by default. The actual provider,
    model, token usage, cost, and latency are persisted for every candidate.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_OPENROUTER_MODEL,
        provider: str | None = "DeepInfra",
        base_url: str = "https://openrouter.ai/api/v1",
        temperature: float = 0.2,
        max_tokens: int = 4096,
        length_retry_max_tokens: int = 16384,
        reasoning_effort: str | None = None,
        timeout_seconds: float = 180.0,
        max_retries: int = 5,
        allow_fallbacks: bool = False,
        transport: Transport | None = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY is required")
        self.model = model
        self.provider = provider
        self.base_url = base_url.rstrip("/")
        self.temperature = temperature
        self.max_tokens = max_tokens
        if length_retry_max_tokens < max_tokens:
            raise ValueError("length_retry_max_tokens must be >= max_tokens")
        self.length_retry_max_tokens = length_retry_max_tokens
        self.reasoning_effort = (
            None
            if reasoning_effort is None
            or reasoning_effort.strip().lower() in {"", "none", "off"}
            else reasoning_effort
        )
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.allow_fallbacks = allow_fallbacks
        self.transport = transport or self._urlopen_transport

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "OpenRouter chat completions",
            "base_url": self.base_url,
            "model": self.model,
            "provider": self.provider,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "length_retry_max_tokens": self.length_retry_max_tokens,
            "length_retry_policy": "double_on_empty_finish_reason_length",
            "reasoning_effort": self.reasoning_effort,
            "reasoning_excluded_from_response": self.reasoning_effort is not None,
            "allow_fallbacks": self.allow_fallbacks,
            "require_parameters": True,
            "data_collection": "deny",
        }

    def rewrite(
        self,
        system_prompt: str,
        user_prompt: str,
        logit_bias: dict[int | str, float] | None = None,
        seed: int | None = None,
    ) -> RewriteResponse:
        provider: dict[str, Any] = {
            "allow_fallbacks": self.allow_fallbacks,
            "require_parameters": True,
            "data_collection": "deny",
        }
        if self.provider:
            provider["only"] = [self.provider]
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "provider": provider,
            "usage": {"include": True},
        }
        if self.reasoning_effort is not None:
            body["reasoning"] = {
                "effort": self.reasoning_effort,
                "exclude": True,
            }
        if logit_bias:
            body["logit_bias"] = {
                str(key): float(value) for key, value in logit_bias.items()
            }
        if seed is not None:
            body["seed"] = int(seed)

        current_max_tokens = self.max_tokens
        payloads: list[dict[str, Any]] = []
        latencies: list[float] = []
        while True:
            body["max_tokens"] = current_max_tokens
            request = self._chat_request(body)
            started = time.perf_counter()
            payload = self._send_with_retries(request)
            latencies.append((time.perf_counter() - started) * 1000)
            payloads.append(payload)
            try:
                choice = payload["choices"][0]
                content = choice["message"]["content"]
            except (KeyError, IndexError, TypeError, AttributeError) as error:
                raise OpenRouterError(
                    "OpenRouter returned no assistant text"
                ) from error
            if isinstance(content, str) and content.strip():
                text = content.strip()
                break
            finish_reason = choice.get("finish_reason")
            if (
                finish_reason == "length"
                and current_max_tokens < self.length_retry_max_tokens
            ):
                current_max_tokens = min(
                    current_max_tokens * 2, self.length_retry_max_tokens
                )
                continue
            reasoning_tokens = (
                (payload.get("usage") or {})
                .get("completion_tokens_details", {})
                .get("reasoning_tokens")
            )
            raise OpenRouterError(
                "OpenRouter returned no assistant text "
                f"(finish_reason={finish_reason!r}, reasoning_tokens={reasoning_tokens!r}, "
                f"attempts={len(payloads)}, max_tokens={current_max_tokens})"
            )

        usages = [payload.get("usage") or {} for payload in payloads]
        completion_details = [
            usage.get("completion_tokens_details") or {} for usage in usages
        ]
        costs = [
            float(usage["cost"]) for usage in usages if usage.get("cost") is not None
        ]
        return RewriteResponse(
            text=text,
            request_id=payload.get("id"),
            model=str(payload.get("model") or self.model),
            provider=payload.get("provider"),
            prompt_tokens=sum(int(usage.get("prompt_tokens") or 0) for usage in usages),
            completion_tokens=sum(
                int(usage.get("completion_tokens") or 0) for usage in usages
            ),
            cost_usd=sum(costs) if costs else None,
            latency_ms=sum(latencies),
            reasoning_tokens=sum(
                int(details.get("reasoning_tokens") or 0)
                for details in completion_details
            ),
            finish_reason=choice.get("finish_reason"),
            request_ids=tuple(
                str(item["id"]) for item in payloads if item.get("id") is not None
            ),
            attempt_count=len(payloads),
            length_retry_count=len(payloads) - 1,
            max_tokens_used=current_max_tokens,
        )

    def _chat_request(self, body: dict[str, Any]) -> urllib.request.Request:
        return urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://unmarker.it",
                "X-Title": "Unmarker text watermark benchmark",
            },
            method="POST",
        )

    def validate_capabilities(self, require_logit_bias: bool = False) -> dict[str, Any]:
        request = urllib.request.Request(
            f"{self.base_url}/models/{self.model}/endpoints",
            headers={"Accept": "application/json"},
        )
        status, response = self.transport(request, self.timeout_seconds)
        if status >= 400:
            raise OpenRouterError(
                f"OpenRouter endpoint discovery failed with HTTP {status}"
            )
        payload = json.loads(response)
        endpoints = payload.get("data", {}).get("endpoints", [])
        matches = [
            endpoint
            for endpoint in endpoints
            if self.provider is None
            or str(endpoint.get("provider_name", "")).lower() == self.provider.lower()
        ]
        if not matches:
            raise OpenRouterError(
                f"Provider {self.provider!r} does not currently serve {self.model!r}"
            )
        if require_logit_bias and not any(
            "logit_bias" in endpoint.get("supported_parameters", [])
            for endpoint in matches
        ):
            raise OpenRouterError(
                f"Provider {self.provider!r} does not expose logit_bias for {self.model!r}"
            )
        models_request = urllib.request.Request(
            f"{self.base_url}/models",
            headers={"Accept": "application/json"},
        )
        models_status, models_response = self.transport(
            models_request, self.timeout_seconds
        )
        if models_status >= 400:
            raise OpenRouterError(
                f"OpenRouter model discovery failed with HTTP {models_status}"
            )
        models = json.loads(models_response).get("data", [])
        model_metadata = next(
            (item for item in models if item.get("id") == self.model), None
        )
        if model_metadata is None:
            raise OpenRouterError(
                f"Model {self.model!r} is missing from model discovery"
            )
        reasoning = model_metadata.get("reasoning") or {}
        supported_efforts = reasoning.get("supported_efforts")
        if (
            supported_efforts
            and self.reasoning_effort is not None
            and self.reasoning_effort not in supported_efforts
        ):
            raise OpenRouterError(
                f"Reasoning effort {self.reasoning_effort!r} is not supported by "
                f"{self.model!r}; supported={supported_efforts}"
            )
        return {
            "model": self.model,
            "provider": self.provider,
            "endpoints": len(matches),
            "logit_bias_supported": any(
                "logit_bias" in endpoint.get("supported_parameters", [])
                for endpoint in matches
            ),
            "statuses": [endpoint.get("status") for endpoint in matches],
            "reasoning_mandatory": bool(reasoning.get("mandatory")),
            "reasoning_effort": self.reasoning_effort,
            "supported_reasoning_efforts": supported_efforts,
        }

    def _send_with_retries(self, request: urllib.request.Request) -> dict[str, Any]:
        for attempt in range(self.max_retries + 1):
            try:
                status, response = self.transport(request, self.timeout_seconds)
                if status >= 400:
                    raise OpenRouterError(
                        f"OpenRouter HTTP {status}: {_safe_error(response)}"
                    )
                payload = json.loads(response)
                if payload.get("error"):
                    error_payload = payload["error"]
                    code = int(error_payload.get("code") or 500)
                    message = str(
                        error_payload.get("message") or "unknown upstream error"
                    )
                    retryable = code == 429 or code >= 500
                    problem = OpenRouterError(
                        f"OpenRouter upstream {code}: {message[:500]}"
                    )
                    if not retryable or attempt == self.max_retries:
                        raise problem
                    time.sleep(min(30.0, (2**attempt) + random.random()))
                    continue
                return payload
            except urllib.error.HTTPError as error:
                response = error.read()
                retryable = error.code == 429 or 500 <= error.code < 600
                problem = OpenRouterError(
                    f"OpenRouter HTTP {error.code}: {_safe_error(response)}"
                )
            except (urllib.error.URLError, TimeoutError) as error:
                retryable = True
                reason = getattr(error, "reason", str(error))
                problem = OpenRouterError(f"OpenRouter request failed: {reason}")
            except json.JSONDecodeError:
                retryable = False
                problem = OpenRouterError("OpenRouter returned invalid JSON")
            except OpenRouterError as error:
                retryable = False
                problem = error
            if not retryable or attempt == self.max_retries:
                raise problem
            time.sleep(min(30.0, (2**attempt) + random.random()))
        raise AssertionError("unreachable")

    @staticmethod
    def _urlopen_transport(
        request: urllib.request.Request,
        timeout: float,
    ) -> tuple[int, bytes]:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.status), response.read()


class HuggingFaceLogitBiasTokenizer:
    def __init__(self, model_name: str, revision: str | None = None) -> None:
        try:
            from transformers import AutoTokenizer
        except ImportError as error:
            raise RuntimeError(
                "Tokenizing BIRA biases requires transformers"
            ) from error
        self.model_name = model_name
        self.revision = revision
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name, revision=revision, use_fast=True
        )

    def build_bias(
        self,
        token_strings: list[str],
        bias: float,
        max_token_ids: int = 300,
    ) -> dict[int, float]:
        token_ids: list[int] = []
        seen: set[int] = set()
        for token_string in token_strings:
            variants = (token_string, token_string.lstrip())
            for variant in variants:
                if not variant:
                    continue
                encoded = self.tokenizer(variant, add_special_tokens=False)["input_ids"]
                for token_id in encoded:
                    value = int(token_id)
                    if value not in seen:
                        seen.add(value)
                        token_ids.append(value)
                    if len(token_ids) >= max_token_ids:
                        return {value: float(bias) for value in token_ids}
        return {value: float(bias) for value in token_ids}


def _safe_error(response: bytes) -> str:
    try:
        payload = json.loads(response)
        message = payload.get("error", {}).get("message") or payload.get("message")
        if message:
            return str(message)[:500]
    except (json.JSONDecodeError, AttributeError):
        pass
    return response.decode("utf-8", errors="replace")[:500]
