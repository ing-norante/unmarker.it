# Gate 2: official MarkLLM corpus

Gate 2 replaces the controlled lexicon with normal model generation and the
official MarkLLM logits processors and detectors. It currently validates corpus
generation and detector baselines. It does **not** run rewrite attacks and must
not be reported as watermark-removal evidence.

The checked-in `datasets/markllm-wikipedia-v1.jsonl` manifest contains 400
validated unique prompts: 100 calibration and 100 evaluation prompts for each
of English and Italian. The full 1,000-generation MarkLLM baseline has not yet
been run or presented as a result.

## Reproducibility boundary

- source: [THU-BPM/MarkLLM](https://github.com/THU-BPM/MarkLLM);
- pinned commit: `c45ddc40f7b761beabe55a1b8dc4690e531d1c6d`;
- algorithms: MarkLLM `KGW`, `Unigram`, and `SynthID` with their checked-in
  configuration files;
- default evidence model: `Qwen/Qwen2.5-0.5B-Instruct`;
- generated continuation only: the prompt is not included in detector input;
- no `VariantLexicon`, synonym groups, or circular composition.

The adapter imports MarkLLM from a source checkout rather than copying or
modifying its algorithms. The source commit and model configuration are written
to every run's `config.json` and `summary.json`.

## Isolated setup

From `research/text-watermark-benchmark`:

```bash
./scripts/fetch_markllm.sh
uv venv --python 3.11
uv pip install -e '.[markllm]'
```

The source checkout, virtual environment, Hugging Face model cache, and
`results/markllm-latest` are not committed. The React application keeps its
existing dependency graph.

MarkLLM's SynthID module imports its Bayesian detector eagerly even when the
mean detector is configured, so the isolated extra includes `scikit-learn` in
addition to MarkLLM's direct runtime dependencies.

## Integration smoke test

The four-row fixture exists only to test installation and API compatibility:

```bash
.venv/bin/python -m unmarker_text_bench.markllm_cli \
  --markllm-root .markllm-source \
  --prompts datasets/markllm-smoke-prompts.jsonl \
  --output results/markllm-latest \
  --model HuggingFaceTB/SmolLM2-135M-Instruct \
  --device mps \
  --max-new-tokens 24 \
  --min-generated-tokens 8 \
  --allow-small-smoke
```

On 2026-08-19 this completed end-to-end on Apple MPS with official KGW,
Unigram, and SynthID. Scores from one calibration and one evaluation prompt per
language are meaningless; for example an empirical FPR can only be 0% or 100%.
The smoke artifacts are intentionally ignored.

Without `--allow-small-smoke`, the runner refuses undersized or malformed
corpora.

## Independent prompt corpus

Each JSONL row must contain:

```json
{
  "id": "unique-id",
  "language": "en",
  "domain": "encyclopedic",
  "split": "calibration",
  "prompt": "A unique model prompt of at least 20 characters."
}
```

IDs and normalized prompt texts must be unique. Supported splits are
`calibration` and `evaluation`. The default minimum is, independently for each
language:

- 100 calibration prompts;
- 100 evaluation prompts.

Thus a valid minimum corpus contains 400 source prompts, without overlapping
windows. This is only a floor. A 100-sample calibration set gives a very coarse
1% tail estimate; a serious report should use at least 1,000 calibration
generations per language while retaining an independent evaluation split.

### Reproducible Wikipedia builder

The builder streams cleaned English and Italian Wikipedia articles from the
`wikimedia/wikipedia` dataset, pinned to revision
`b04c8d1ceb2f5cd4588862100d08de323dccfbaa`. Each article contributes one unique
title-derived instruction and source provenance; article bodies are not copied
into the benchmark.

The first Parquet streaming access can take several minutes and roughly 1 GB of
RAM even for a tiny sample; subsequent corpus size mostly affects iteration,
not dependency setup.

```bash
.venv/bin/python scripts/build_wikipedia_prompts.py \
  --output datasets/markllm-wikipedia-v1.jsonl \
  --calibration-per-language 100 \
  --evaluation-per-language 100
```

Wikipedia content is distributed under CC BY-SA 3.0 and GFDL; preserve the
`source` metadata in downstream artifacts.

## Evidence baseline run

```bash
.venv/bin/python -m unmarker_text_bench.markllm_cli \
  --markllm-root .markllm-source \
  --prompts datasets/markllm-wikipedia-v1.jsonl \
  --output results/markllm-wikipedia-v1 \
  --model Qwen/Qwen2.5-0.5B-Instruct \
  --device mps \
  --max-new-tokens 192 \
  --min-generated-tokens 80
```

Unwatermarked text is generated once per prompt. For evaluation prompts, each
watermarked counterpart uses the same model, prompt, decoding configuration,
and sampling seed. Calibration prompts produce only unwatermarked generations,
avoiding unnecessary watermarked inference.

Thresholds are estimated independently for each algorithm/language from the
calibration split. FPR and watermarked TPR are then measured only on the
evaluation split.

## Outputs and promotion gates

- `generations.jsonl`: prompts, provenance, continuations, raw scores, built-in
  decisions, calibrated decisions, token counts, and latency;
- `summary.json`: split counts, thresholds, held-out FPR/TPR, length pass rates,
  and backend metadata;
- `config.json`: complete Gate 2 and backend configuration.

Do not connect rewrite attacks until all selected detector-language cells have:

1. adequate held-out text length;
2. acceptable held-out FPR near the target;
3. strong pre-attack TPR;
4. manually inspected English and Italian generation quality.

Only after these gates pass should the shared fixed/progressive attack policy be
run against the stored MarkLLM corpus.
