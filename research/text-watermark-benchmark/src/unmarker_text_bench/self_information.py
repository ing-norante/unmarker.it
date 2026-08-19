from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Protocol


@dataclass(frozen=True)
class TokenSurprisal:
    index: int
    token_id: int
    token_text: str
    start: int
    end: int
    self_information: float


class SelfInformationScorer(Protocol):
    @property
    def metadata(self) -> dict[str, Any]: ...

    def score(self, text: str) -> list[TokenSurprisal]: ...


class CausalSelfInformationScorer:
    """Teacher-forced token surprisal from one causal-model forward pass."""

    def __init__(
        self,
        model_name: str,
        model_revision: str | None = None,
        device: str = "cuda",
    ) -> None:
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as error:
            raise RuntimeError("The scorer requires torch and transformers") from error

        self.torch = torch
        self.model_name = model_name
        self.model_revision = model_revision
        self.device = device
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            revision=model_revision,
            use_fast=True,
        )
        dtype = torch.bfloat16 if device == "cuda" else torch.float32
        model_kwargs: dict[str, Any] = {
            "revision": model_revision,
            "dtype": dtype,
        }
        if device == "cuda":
            model_kwargs["device_map"] = {"": "cuda"}
        try:
            self.model = AutoModelForCausalLM.from_pretrained(
                model_name,
                **model_kwargs,
            )
        except TypeError:
            model_kwargs["torch_dtype"] = model_kwargs.pop("dtype")
            self.model = AutoModelForCausalLM.from_pretrained(
                model_name,
                **model_kwargs,
            )
        if device != "cuda":
            self.model.to(device)
        self.model.eval()

    @property
    def metadata(self) -> dict[str, Any]:
        return {
            "implementation": "causal_teacher_forced_self_information",
            "model": self.model_name,
            "model_revision": self.model_revision,
            "device": self.device,
            "log_base": "e",
            "first_token_omitted": True,
        }

    def score(self, text: str) -> list[TokenSurprisal]:
        encoded = self.tokenizer(
            text,
            return_tensors="pt",
            return_offsets_mapping=True,
            add_special_tokens=False,
        )
        offsets = encoded.pop("offset_mapping")[0].tolist()
        encoded = encoded.to(self.device)
        input_ids = encoded["input_ids"][0]
        if input_ids.numel() < 2:
            return []
        with self.torch.inference_mode():
            logits = self.model(**encoded).logits[0, :-1].float()
            log_probabilities = self.torch.log_softmax(logits, dim=-1)
            target_ids = input_ids[1:]
            values = -log_probabilities.gather(1, target_ids.unsqueeze(1)).squeeze(1)

        rows = []
        ids = input_ids.detach().cpu().tolist()
        for index, value in enumerate(values.detach().cpu().tolist(), start=1):
            start, end = offsets[index]
            rows.append(
                TokenSurprisal(
                    index=index,
                    token_id=int(ids[index]),
                    token_text=text[start:end],
                    start=int(start),
                    end=int(end),
                    self_information=float(value),
                )
            )
        return rows


def select_high_information(
    scores: list[TokenSurprisal],
    budget_ratio: float,
    minimum_spacing: int = 0,
) -> list[TokenSurprisal]:
    if not 0.0 < budget_ratio <= 1.0:
        raise ValueError("budget_ratio must be in (0, 1]")
    if minimum_spacing < 0:
        raise ValueError("minimum_spacing cannot be negative")
    if not scores:
        return []

    wanted = max(1, math.ceil(len(scores) * budget_ratio))
    selected: list[TokenSurprisal] = []
    ranked = sorted(scores, key=lambda row: (-row.self_information, row.index))
    for token in ranked:
        if minimum_spacing and any(
            abs(token.index - previous.index) <= minimum_spacing
            for previous in selected
        ):
            continue
        selected.append(token)
        if len(selected) == wanted:
            break
    # A strict spacing constraint cannot reach large budgets. Preserve the exact
    # budget by filling the remainder in score order after the dispersed pass.
    if len(selected) < wanted:
        selected_indexes = {token.index for token in selected}
        selected.extend(
            token for token in ranked if token.index not in selected_indexes
        )
        selected = selected[:wanted]
    return sorted(selected, key=lambda row: row.index)


def mask_selected_tokens(text: str, selected: list[TokenSurprisal]) -> str:
    """Replace selected source spans while preserving all untouched characters."""

    if not selected:
        return text
    chunks: list[str] = []
    cursor = 0
    for token in sorted(selected, key=lambda row: (row.start, row.end)):
        if token.start < cursor:
            continue
        chunks.append(text[cursor : token.start])
        chunks.append("[BLANK]")
        cursor = token.end
    chunks.append(text[cursor:])
    return "".join(chunks)


def unique_token_strings(selected: list[TokenSurprisal]) -> list[str]:
    seen: set[str] = set()
    result = []
    for token in sorted(selected, key=lambda row: -row.self_information):
        if token.token_text and token.token_text not in seen:
            seen.add(token.token_text)
            result.append(token.token_text)
    return result


class ScoringCorpusRunner:
    """Create a resumable score artifact for baseline and watermarked texts."""

    ARTIFACT_SCHEMA_VERSION = 1

    def __init__(self, scorer: SelfInformationScorer) -> None:
        self.scorer = scorer

    def run(
        self,
        generations_path: Path,
        output_path: Path,
        resume: bool = True,
        checkpoint: Callable[[], None] | None = None,
        checkpoint_every: int = 20,
    ) -> dict[str, Any]:
        generations = _read_jsonl(generations_path)
        source_sha = hashlib.sha256(generations_path.read_bytes()).hexdigest()
        manifest = {
            "artifact_schema_version": self.ARTIFACT_SCHEMA_VERSION,
            "generations_sha256": source_sha,
            "scorer": self.scorer.metadata,
        }
        manifest_path = output_path.with_suffix(".manifest.json")
        if resume and output_path.exists():
            if (
                not manifest_path.exists()
                or json.loads(manifest_path.read_text(encoding="utf-8")) != manifest
            ):
                raise ValueError(
                    "Cannot resume token scoring with a different input or scorer"
                )
            existing_rows = _read_jsonl(output_path)
        else:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text("", encoding="utf-8")
            existing_rows = []
        manifest_path.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        rows_by_key = {str(row["score_key"]): row for row in existing_rows}
        work = self._build_work_items(generations)
        for score_key, metadata, text in work:
            if score_key in rows_by_key:
                continue
            row = {
                "score_key": score_key,
                **metadata,
                "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "token_count": 0,
                "tokens": [],
            }
            token_scores = self.scorer.score(text)
            row["token_count"] = len(token_scores)
            row["tokens"] = [asdict(token) for token in token_scores]
            with output_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
                handle.flush()
            rows_by_key[score_key] = row
            if checkpoint and len(rows_by_key) % checkpoint_every == 0:
                checkpoint()
        if checkpoint:
            checkpoint()
        return {
            "rows": len(rows_by_key),
            "source_generations": len(generations),
            "scorer": self.scorer.metadata,
            "output": str(output_path),
        }

    @staticmethod
    def _build_work_items(
        generations: list[dict[str, Any]],
    ) -> list[tuple[str, dict[str, Any], str]]:
        work: dict[str, tuple[dict[str, Any], str]] = {}
        for row in generations:
            baseline_key = f"{row['sample_id']}|baseline"
            work.setdefault(
                baseline_key,
                (
                    {
                        "sample_id": row["sample_id"],
                        "language": row["language"],
                        "algorithm": None,
                        "text_role": f"{row['split']}_unwatermarked",
                    },
                    row["unwatermarked_text"],
                ),
            )
            if row.get("watermarked_text") is not None:
                watermarked_key = f"{row['sample_id']}|{row['algorithm']}|watermarked"
                work[watermarked_key] = (
                    {
                        "sample_id": row["sample_id"],
                        "language": row["language"],
                        "algorithm": row["algorithm"],
                        "text_role": "evaluation_watermarked",
                    },
                    row["watermarked_text"],
                )
        return [(key, *work[key]) for key in sorted(work)]


def token_scores_from_row(row: dict[str, Any]) -> list[TokenSurprisal]:
    return [TokenSurprisal(**token) for token in row["tokens"]]


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}") from error
    return rows
