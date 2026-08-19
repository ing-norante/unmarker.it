# Corrected Reference Run v2

Date: 2026-08-19

```bash
PYTHONPATH=research/text-watermark-benchmark/src \
  python3 -m unmarker_text_bench.cli \
  --output research/text-watermark-benchmark/results/reference-v2
```

## Conclusion

This run is a harness regression test, not algorithmic evidence that
position-aware BIRA is better than the baselines.

After removing the main comparison confounds, position-aware BIRA evades one
additional eligible case compared with simple paraphrasing (22/24 versus
21/24) and changes slightly fewer tokens under the shared progressive policy
(10.4% versus 11.1%). The documents overlap, the detection difference is one
case, and the edit difference is 0.7 percentage points, so no superiority claim
is warranted.

Reference v1 is retained for provenance but is superseded. Its 7.9% aggregate
mixed unequal fixed budgets, early stopping available only to position-aware
BIRA, a weak Italian KGW cell, and identical embedder/rewriter candidate pools.
The former 37/40/42% edit-saving claim must not be used.

## What changed from v1

1. Every pipeline is evaluated at fixed 15%, 35%, and 65% editable-position
   budgets.
2. The same conservative-to-aggressive stopping policy is applied to every
   pipeline.
3. The primary table excludes cells whose no-attack baseline TPR is below 100%.
4. Embedder output candidates and rewriter output candidates are disjoint. They
   still share the controlled semantic ontology, which remains a limitation.
5. Synonym-canonical F1 and protected-span checks are treated as regression
   gates, not independent evidence of human quality.
6. The report names 16 source passages and overlapping composed documents
   instead of presenting 48 detector-text pairs as independent samples.

## Experimental units

- 8 English and 8 Italian source passages;
- circular windows of 4 passages, producing 16 overlapping composed documents;
- 3 detector surrogates applied to each document, producing 48 attack cases;
- only 16 source passages, 8 per language, are the underlying source units;
- detector thresholds calibrated separately by language with 128 null keys at
  target FPR 1%;
- no inferential statistics are reported because neither the circular windows
  nor the three detector copies are independent observations.

## Baseline-strength gate

| Language | Surrogate | No-attack TPR | Primary comparison |
|---|---|---:|---|
| English | KGW-like | 100.0% | Included |
| English | SynthID-tournament-like | 50.0% | Excluded |
| English | Unigram-like | 100.0% | Included |
| Italian | KGW-like | 25.0% | Excluded |
| Italian | SynthID-tournament-like | 75.0% | Excluded |
| Italian | Unigram-like | 100.0% | Included |

The primary comparison therefore contains 24 detector-document cases from
three cells. This is a filtering rule for readable diagnostics, not a remedy
for the small effective sample size.

## Shared progressive policy on eligible cells

| Pipeline | Residual TPR | Conditional evasion | Changed-token ratio | Successful stops |
|---|---:|---:|---:|---:|
| Simple paraphrase | 12.5% (3/24) | 87.5% | 11.1% | 21/24 |
| SIRA reference, budget-normalized | 25.0% (6/24) | 75.0% | 11.0% | 18/24 |
| BIRA reference, budget-normalized | 25.0% (6/24) | 75.0% | 11.2% | 18/24 |
| Position-aware BIRA | **8.3% (2/24)** | **91.7%** | **10.4%** | **22/24** |

Position-aware BIRA is descriptively best on both fields in this run, but only
by one detection and 0.7 edit percentage points versus simple paraphrasing. One
small, overlapping toy fixture cannot establish a ranking or uncertainty bound.

Selected budgets also show that aggressive rewriting remains common:

| Pipeline | Conservative | Intermediate | Aggressive |
|---|---:|---:|---:|
| Simple paraphrase | 1 | 7 | 16 |
| SIRA reference | 1 | 7 | 16 |
| BIRA reference | 0 | 8 | 16 |
| Position-aware BIRA | 1 | 9 | 14 |

## Fixed-budget comparison on eligible cells

All methods operate at the same editable-position budget in this table and have
the same mean changed-token ratio at a given budget. This isolates selection
order from progressive stopping.

| Pipeline | 15% TPR / edits | 35% TPR / edits | 65% TPR / edits |
|---|---:|---:|---:|
| Simple paraphrase | 95.8% / 3.2% | 66.7% / 7.3% | 12.5% / 13.2% |
| SIRA reference | 95.8% / 3.2% | 66.7% / 7.3% | 25.0% / 13.2% |
| BIRA reference | 100.0% / 3.2% | 66.7% / 7.3% | 25.0% / 13.2% |
| Position-aware BIRA | 95.8% / 3.2% | **58.3% / 7.3%** | **8.3% / 13.2%** |

At 65%, position-aware BIRA differs from simple paraphrasing by one case. At
15%, all strategies fail almost completely. The descriptive gap grows against
SIRA/BIRA, but the construction and dependence problems still preclude an
algorithmic claim.

## Quality fields

The synonym-canonical F1, NLI proxy, and protected-content preservation values
are all 1.0. They are omitted from the main tables because this is expected by
construction: validators canonicalize the controlled semantic classes and the
strategies cannot edit protected spans. These fields remain useful regression
tests but do not approximate human judgment in this experiment.

The blinded human-review file is still unevaluated. Local latency and zero cost
are implementation diagnostics, not backend estimates.

## Remaining limitations

- Surrogates are not MarkLLM or production watermark implementations.
- SIRA and BIRA are budget-normalized core-strategy references, not official
  repositories or model stacks.
- The causal scorer is a deterministic bilingual n-gram model.
- Candidate output pools are disjoint, but both sides know the same curated
  semantic ontology.
- Only 8 source passages per language feed overlapping windows.
- No model-based multilingual NLI, embeddings, or human ratings are present.

## Next evidence gate

Do not tune another claim on this toy run. Preserve the runner and replace the
largest sources of construction bias in this order:

1. MarkLLM-backed KGW, Unigram, and SynthID configurations that score normal
   model-generated text without the benchmark lexicon;
2. official SIRA/BIRA code paths and a common budget-policy adapter;
3. an open-weight causal scorer and constrained rewriter whose vocabulary is
   independent of the detector;
4. multilingual NLI, sentence embeddings, and blinded human evaluation;
5. at least 200 independent documents per language and domain-stratified
   reporting.

Machine-readable results are in
[`results/reference-v2/summary.json`](results/reference-v2/summary.json), with
all fixed-budget attempts in [`runs.csv`](results/reference-v2/runs.csv).
