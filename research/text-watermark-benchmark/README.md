# Text Watermark Benchmark

This directory contains an isolated research harness for comparing four text rewrite strategies:

1. simple paraphrasing;
2. SIRA-style self-information masking and reconstruction;
3. BIRA-style global proxy suppression;
4. a position-aware BIRA variant with progressive edit budgets.

The benchmark is deliberately separate from the React application. It is intended to validate algorithmic choices before a backend API or product UI is designed.

The complete remote Gate 2/3 workflow is documented in
[`MARKLLM.md`](MARKLLM.md). It uses Modal for official MarkLLM generation,
self-information scoring, target detection, and neural quality validation;
OpenRouter supplies the constrained frontier rewriter. It does not change the
React application's dependency graph and requires no Ollama process.

The remote run also produces two controls that are deliberately excluded from
the candidate-algorithm ranking: an adaptive target-detector oracle paraphrase
baseline and a clean-text re-stamp control. Every rewrite passes through a
conservative, separately runnable Unicode hygiene module with a per-output
audit trail.

## Current scope

The default run is dependency-free and deterministic. It uses:

- a small bilingual n-gram scoring model as the causal-model adapter;
- controlled KGW, Unigram, and SynthID-tournament-like surrogate watermarks;
- English and Italian reference passages containing names, numbers, URLs, quotations, and negations;
- rule-based semantic and entailment proxies;
- exact preservation checks for protected content.

The controlled embedder and rewriters no longer emit candidates from the same
pool. For each semantic class, the embedder is restricted to the first two
variants and every rewriter to the last two. Their output vocabularies are
disjoint, although the semantic ontology remains shared and is still a toy
benchmark limitation.

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

The corrected checked-in controlled result is summarized in
[`RESULTS.md`](RESULTS.md). `results/reference-v1` is retained as a historical
run whose comparison was confounded by unequal budget policies and shared
candidate pools; it must not be used as algorithmic evidence.

## Outputs

Each run writes:

- `summary.json`: aggregated TPR at the calibrated 1% FPR threshold, edit distance, semantic quality, latency, and cost fields;
- `runs.csv`: every fixed-pipeline result and every attempted progressive budget;
- `human-review.csv`: blinded-ready rows with empty 1-5 human rating fields;
- `config.json`: the complete benchmark configuration.

All four pipelines are evaluated at all three fixed budgets, producing an
uncensored fixed-budget grid. Separately, the `selected` column identifies the
candidate selected by the same progressive policy for every pipeline. The
first candidate that is below the active detector threshold and passes all
quality gates is selected. If none passes, the aggressive candidate is retained
and `stop_passed` is false.

The primary comparison includes only language-detector cells whose no-attack
baseline detects every composed document. Results for weaker cells remain in
the diagnostics and are never silently discarded.

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
  self_information.py causal teacher-forced scorer and exact-budget selection
  attack_pipeline.py  simple, SIRA, BIRA, and position-aware remote attacks
  openrouter_backend.py provider-pinned constrained rewrite client
  remote_evaluation.py official detectors and multilingual neural validation
  final_report.py     development-fitted surrogate and held-out reports
  unicode_hygiene.py conservative invisible-carrier cleanup and audit
modal_pipeline.py     resumable Modal GPU jobs and artifact transfer
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

`semantic_similarity` in `runs.csv` is retained for schema compatibility but is
reported as `synonym-canonical F1` in `summary.json`. It canonicalizes the same
controlled semantic groups before calculating content-token F1. `nli_proxy` is
the minimum of content recall, exact protected-content preservation, and
negation preservation. Both are regression gates, not independent quality
evidence, and are omitted from the primary result table.

The human review sheet is required before treating an experiment as product evidence.

## Conservative Unicode hygiene

The Unicode module removes only high-confidence invisible carriers and
canonicalizes space-like characters. It preserves valid emoji ZWJ sequences,
script shaping controls, balanced bidi embeddings/isolates, CJK variation
selectors, and subdivision-flag tags. Unknown format controls and private-use
characters are reported rather than silently deleted. NFKC compatibility
normalization is disabled unless explicitly requested.

```bash
printf 'alpha\u200bbeta' | uv run unmarker-unicode-hygiene

uv run unmarker-unicode-hygiene input.txt \
  --output cleaned.txt \
  --report unicode-audit.json
```

This hygiene pass is useful independently, but its effect must not be presented
as evidence of statistical watermark removal.

## Shared budget policies

Default budgets operate on editable positions. They are applied to every
pipeline both as a fixed grid and through the shared progressive stopping rule:

| Mode | Editable positions targeted |
|---|---:|
| Conservative | 15% |
| Intermediate | 35% |
| Aggressive | 65% |

The values are experiment configuration, not final product defaults. A fixed
budget comparison isolates selection/ranking; the progressive comparison
measures the complete search policy. It is invalid to compare a progressive
pipeline against a fixed-budget baseline as if the difference came only from
ranking.

## Evidence gates

The checked-in reference benchmark is only Gate 1. The remote pipeline now
implements the next experimental stages, but production integration still
requires:

1. execute and qualify the independent Modal corpus baseline;
2. run a bounded OpenRouter pilot before the complete fixed-budget grid;
3. evaluate only the held-out split after fitting the surrogate on development;
4. complete the generated blinded human review sheet;
5. repeat across model families and additional domains;
6. avoid any claim about Claude until an authorized production detector can verify it.
