# Gate 2b EXP pilot results

Run: `gate2b-exp-pilot-20260822-01` on 2026-08-22.

## Outcome

This pilot does not promote BIRA or position-aware BIRA. The simple paraphrase
baseline currently offers the best quality-preserving evasion/edit trade-off in
both languages. Position-aware BIRA has higher raw English evasion, but not a
statistically clear quality-preserving advantage over simple paraphrasing and
requires substantially more edits.

The result is evidence about official MarkLLM EXP with the pinned Qwen/OpenRouter
stack only. It is not evidence about Claude or an undisclosed production
watermark. Human audit remains pending.

## Executed design

- official MarkLLM EXP generation and detection with Qwen3-14B;
- 100 clean calibration and 50 independent evaluation prompts per language;
- deterministic 20-development/30-held-out split per language;
- 1,200 candidate rewrites: four pipelines, three fixed budgets, 100 cases;
- 300 adaptive-oracle attempts and 100 clean re-stamp controls;
- 1,720 Qwen rewrite calls through the pinned DeepInfra route;
- 1,600 Modal evaluations with GLiNER, multilingual embeddings, and
  bidirectional NLI;
- 240 blinded GPT-5.6 Terra quality judgments and a 48-row manual audit sheet.

OpenRouter rewrite cost was $0.2703 and judge cost was $0.9525, for $1.2228
total. Modal GPU cost is not included in these figures. One SIRA output ended
with `finish_reason=length`; the report completion gate forces it to fail
quality.

## Baseline qualification

Across all 50 evaluation prompts per language, calibrated EXP clean FPR was 0%
for English and 6% for Italian; watermarked TPR was 88% and 92%, respectively.
The 6% Italian FPR is a material finite-sample limitation and must not be
reported as 1%. In the 30-prompt held-out subsets, pre-attack TPR was 90% for
English and 96.7% for Italian.

GLiNER was calibrated on 50 published human-gold rows per language using the
common PER/ORG/LOC schema. The selected thresholds and exact-span results were:

| Language | Threshold | Precision | Recall | F1 |
|---|---:|---:|---:|---:|
| English | 0.90 | 63.2% | 63.2% | 63.2% |
| Italian | 0.80 | 83.0% | 72.1% | 77.2% |

English entity extraction is a weak quality gate in this pilot. The gold source
combines UNER English-EWT (CC BY-SA 4.0) and KIND Wikinews (CC BY-NC 4.0), so
the calibration artifact is research-only.

## Progressive held-out comparison

Quality-preserving conditional evasion includes only cases detected before the
attack and requires every deterministic, semantic, NLI, and API-completion gate
to pass.

| Pipeline | Lang | Conditional evasion | Quality-preserving evasion | 95% Wilson CI | Quality pass | Mean token edits | Mean budgets attempted |
|---|---|---:|---:|---:|---:|---:|---:|
| Simple paraphrase | EN | 77.8% | 63.0% (17/27) | 44.2–78.5% | 80.0% | 21.5% | 1.50 |
| Position-aware BIRA | EN | 100.0% | 51.9% (14/27) | 34.0–69.3% | 50.0% | 48.7% | 2.20 |
| BIRA | EN | 92.6% | 37.0% (10/27) | 21.5–55.8% | 43.3% | 45.9% | 2.23 |
| SIRA | EN | 66.7% | 37.0% (10/27) | 21.5–55.8% | 60.0% | 33.0% | 2.00 |
| Simple paraphrase | IT | 62.1% | 51.7% (15/29) | 34.4–68.6% | 86.7% | 27.2% | 2.53 |
| Position-aware BIRA | IT | 44.8% | 31.0% (9/29) | 17.3–49.2% | 66.7% | 41.9% | 2.53 |
| BIRA | IT | 48.3% | 24.1% (7/29) | 12.2–42.1% | 66.7% | 35.1% | 2.67 |
| SIRA | IT | 62.1% | 24.1% (7/29) | 12.2–42.1% | 53.3% | 49.2% | 2.63 |

The table's mean edit rate is the report metric over all 30 held-out prompts;
success denominators exclude pre-attack false negatives.

Paired exact McNemar comparisons on the same initially detected prompts give:

| Comparison | EN discordant wins | EN p | IT discordant wins | IT p |
|---|---:|---:|---:|---:|
| Simple vs position-aware BIRA | 5–2 | 0.453 | 9–3 | 0.146 |
| Simple vs BIRA | 7–0 | 0.016 | 10–2 | 0.039 |
| Simple vs SIRA | 8–1 | 0.039 | 8–0 | 0.008 |

These p-values are unadjusted exploratory diagnostics. With only 27 English and
29 Italian detected cases, the wide confidence intervals and multiple
comparisons prevent a definitive algorithm ranking.

## Controls and quality review

The held-out re-stamp control introduced no EXP false positives in either
language, but only 26.7% of English and 50.0% of Italian clean paraphrases passed
all quality gates. This shows that the rewriter itself is a major quality
bottleneck.

The target-oracle baseline achieved quality-preserving evasion of 18.5% in
English and 44.8% in Italian. Its full paraphrases changed roughly 79% of tokens
and frequently failed protected-content checks, so detector access alone did
not solve the quality problem.

The blinded Terra pre-screen passed 72.9% of the 240 progressive selections,
flagged material errors in 22.1%, and disagreed with deterministic/neural gates
on 73 rows. Mean fluency and naturalness were 4.72/5. The 48-row blinded manual
audit remains required because the judge is not human ground truth.

## Decision

Keep simple paraphrasing as the operational baseline for the next experiment.
Do not promote position-aware BIRA: its apparent raw-evasion benefit is bought
with much larger edits, and its quality-preserving advantage over the simple
baseline is neither observed nor statistically established here.

The next evidence gate should:

1. complete the 48-row blinded human audit;
2. fix or constrain entity, number, and negation preservation before tuning the
   attack ranking further;
3. repeat with a larger held-out set and a detector calibration sample large
   enough to resolve a 1% FPR;
4. add another executable official watermark family and at least one additional
   rewriter model/provider;
5. retain the same fixed-budget grid and paired-prompt analysis.
