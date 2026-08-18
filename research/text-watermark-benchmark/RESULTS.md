# Reference Run v1

Date: 2026-08-19

Command:

```bash
PYTHONPATH=research/text-watermark-benchmark/src \
  python3 -m unmarker_text_bench.cli \
  --output research/text-watermark-benchmark/results/reference-v1
```

## Experimental unit

- 8 English and 8 Italian source passages;
- circular composition of 4 passages into approximately 200-token documents;
- 16 composed documents;
- 3 independently keyed detector surrogates per document;
- 48 watermarked attack cases;
- detector thresholds calibrated per language with 128 null keys at target FPR 1%;
- all aggregate attack metrics use the selected output of each pipeline.

## Aggregate result

| Pipeline | TPR @ 1% FPR | Conditional evasion | Changed-token ratio | Semantic proxy | Protected content |
|---|---:|---:|---:|---:|---:|
| No attack | 91.7% | - | 0.0% | 1.000 | 100% |
| Simple paraphrase | 0.0% | 100% | 12.6% | 0.999 | 100% |
| SIRA reference | 0.0% | 100% | 13.6% | 1.000 | 100% |
| BIRA reference | 0.0% | 100% | 13.1% | 1.000 | 100% |
| Position-aware BIRA | 0.0% | 100% | **7.9%** | 1.000 | 100% |

Within this controlled benchmark, position-aware BIRA reaches the same conditional evasion as the three baselines while changing:

- 37% fewer tokens than simple paraphrasing;
- 40% fewer tokens than the BIRA reference;
- 42% fewer tokens than the SIRA reference.

This is the first useful signal from the project: position-level ranking plus non-overlapping contextual edits merits evaluation with real causal models and official detector implementations.

## Progressive budget behavior

The selected budget across 48 cases was:

| Budget | Selected cases | Share |
|---|---:|---:|
| Conservative, 15% of editable positions | 6 | 12.5% |
| Intermediate, 35% | 31 | 64.6% |
| Aggressive, 65% | 11 | 22.9% |

Every selected position-aware candidate passed the detector and quality gates. The aggressive budget was therefore needed in fewer than one quarter of cases.

## Detector/language diagnostic

| Language | Surrogate | TPR before attack | Position-aware TPR | Position-aware changed tokens |
|---|---|---:|---:|---:|
| English | KGW-like | 100% | 0% | 12.4% |
| English | SynthID-tournament-like | 100% | 0% | 10.9% |
| English | Unigram-like | 100% | 0% | 7.7% |
| Italian | KGW-like | **50%** | 0% | 4.0% |
| Italian | SynthID-tournament-like | 100% | 0% | 6.4% |
| Italian | Unigram-like | 100% | 0% | 6.2% |

The Italian KGW-like cell fails the intended baseline-strength gate and must not be used as positive evidence. Its conditional evasion metric covers only the four documents detected before rewriting. The other five cells start at 100% TPR.

## Interpretation boundaries

This run validates harness behavior, not production watermark removal.

- The watermarks are controlled surrogates, not Anthropic's secret Claude configuration.
- The causal scorer is a deterministic bilingual n-gram adapter, not an LLM.
- Rewrites use curated synonym classes, not the official SIRA/BIRA model stacks.
- The semantic and NLI values are regression proxies; the human-review sheet remains unevaluated.
- Local reference latency is not representative of a GPU/API backend.
- Cost is recorded as zero because this run uses no paid inference. The field is ready for real provider or GPU costs.

The machine-readable evidence is in [`results/reference-v1/summary.json`](results/reference-v1/summary.json). Per-attempt metrics are in [`runs.csv`](results/reference-v1/runs.csv), and [`human-review.csv`](results/reference-v1/human-review.csv) is ready for blinded ratings.

## Next gate

The next experiment should preserve this runner and replace components in this order:

1. causal scorer with an open-weight multilingual model;
2. constrained rewriter with a model exposing token logits/logit processors;
3. semantic proxies with multilingual NLI and sentence embeddings;
4. surrogates with MarkLLM implementations;
5. reference BIRA/SIRA strategies with their official repositories;
6. dataset with at least 200 independent documents per language.
