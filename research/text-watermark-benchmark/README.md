# Text Watermark Benchmark

This directory contains an isolated research harness for comparing four text rewrite strategies:

1. simple paraphrasing;
2. SIRA-style self-information masking and reconstruction;
3. BIRA-style global proxy suppression;
4. a position-aware BIRA variant with progressive edit budgets.

The benchmark is deliberately separate from the React application. It is intended to validate algorithmic choices before a backend API or product UI is designed.

## Current scope

The default run is dependency-free and deterministic. It uses:

- a small bilingual n-gram scoring model as the causal-model adapter;
- controlled KGW, Unigram, and SynthID-tournament-like surrogate watermarks;
- English and Italian reference passages containing names, numbers, URLs, quotations, and negations;
- rule-based semantic and entailment proxies;
- exact preservation checks for protected content.

These components validate the benchmark mechanics and relative edit/quality trade-offs. They are **not** evidence that a strategy removes Claude's production watermark. The surrogate detector names in the reports are intentionally explicit.

By default, four adjacent passages of the same language are composed into an approximately 200-token evaluation document. This avoids presenting short-text detector behavior as if it were representative of watermark detection on longer passages. The composition window is recorded in `config.json`.

The SIRA and BIRA pipelines reproduce the papers' core algorithmic decisions, but they do not load the authors' model weights or official inference stacks. They are marked as reference implementations in every output record.

## Run

From this directory:

```bash
PYTHONPATH=src python3 -m unmarker_text_bench.cli
```

Or install the isolated project with `uv`:

```bash
uv run unmarker-text-bench
```

Useful options:

```bash
PYTHONPATH=src python3 -m unmarker_text_bench.cli \
  --dataset datasets/bilingual-reference.jsonl \
  --output results/experiment-01 \
  --null-keys 128
```

No web or development server is started.

The checked-in controlled result is summarized in [`RESULTS.md`](RESULTS.md).

## Outputs

Each run writes:

- `summary.json`: aggregated TPR at the calibrated 1% FPR threshold, edit distance, semantic quality, latency, and cost fields;
- `runs.csv`: every fixed-pipeline result and every attempted progressive budget;
- `human-review.csv`: blinded-ready rows with empty 1-5 human rating fields;
- `config.json`: the complete benchmark configuration.

The `selected` column identifies the output used in aggregate metrics. For the position-aware pipeline, conservative, intermediate, and aggressive candidates are tried in order. The first candidate that is below the active detector threshold and passes all quality gates is selected. If none passes, the most aggressive candidate is retained and `stop_passed` is false.

## Components

```text
datasets/
  bilingual-reference.jsonl
src/unmarker_text_bench/
  language_model.py   causal scoring adapter
  strategies.py       four rewrite pipelines
  validators.py       semantic and protected-span gates
  watermarks.py       calibrated research surrogates
  metrics.py          edit-distance metrics
  runner.py           experiment orchestration and exports
tests/
  test_benchmark.py
```

The interfaces in `types.py` are the seam for future components:

- replace `ReferenceNgramScorer` with a Hugging Face or hosted causal model;
- replace reference rewrite strategies with the official SIRA/BIRA repositories;
- add MarkLLM-backed detector adapters;
- add multilingual NLI and sentence-embedding evaluators;
- populate API/GPU cost profiles without changing the runner.

## Metrics and interpretation

`TPR@1%FPR` is calculated after calibrating each surrogate detector separately on clean English and Italian texts using independent null keys. Lower is better after an attack.

`changed_token_ratio` is token-level Levenshtein distance divided by input token count. It is calculated against the watermarked input, which is the text a user would submit.

`conditional_evasion_rate` considers only samples detected before rewriting. It prevents detector false negatives in the clean attack baseline from being counted as successful removals.

`semantic_similarity` canonicalizes synonym groups before calculating content-token F1. `nli_proxy` is the minimum of content recall, exact protected-content preservation, and negation preservation. These are fast regression gates, not replacements for model-based multilingual NLI or human evaluation.

The human review sheet is required before treating an experiment as product evidence.

## Progressive position-aware policy

Default budgets operate on editable positions ranked by token self-information:

| Mode | Editable positions targeted |
|---|---:|
| Conservative | 15% |
| Intermediate | 35% |
| Aggressive | 65% |

The values are experiment configuration, not final product defaults.

## Next evidence gates

The reference benchmark is only Gate 1. Before integration into unmarker.it:

1. reproduce BIRA and SIRA with their official code and open-weight models;
2. connect MarkLLM detector implementations, including its SynthID configuration;
3. replace the NLI proxy with a multilingual NLI model and sentence embeddings;
4. expand to at least 200 passages per language and multiple domains;
5. perform blinded human evaluation;
6. report cost and latency on the intended backend infrastructure;
7. avoid any claim about Claude until an authorized production detector can verify it.
