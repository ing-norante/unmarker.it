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
watermark. The primary 48-row human audit is complete, and a second reviewer
independently scored a 12-row enriched subset whose disagreements were fully
adjudicated. The result remains exploratory: the primary sample has one
reviewer, the reliability subset is deliberately enriched rather than
representative, and the operational pass threshold was not preregistered.

## Executed design

- official MarkLLM EXP generation and detection with Qwen3-14B;
- 100 clean calibration and 50 independent evaluation prompts per language;
- deterministic 20-development/30-held-out split per language;
- 1,200 candidate rewrites: four pipelines, three fixed budgets, 100 cases;
- 300 adaptive-oracle attempts and 100 clean re-stamp controls;
- 1,720 Qwen rewrite calls through the pinned DeepInfra route;
- 1,600 Modal evaluations with GLiNER, multilingual embeddings, and
  bidirectional NLI;
- 240 blinded GPT-5.6 Terra quality judgments and a completed 48-row manual
  audit: 24 balanced-core rows plus 24 disagreement-enriched diagnostics.

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
audit confirms that the judge is a useful pre-screen, not human ground truth.

## Human audit

The completed audit exactly matches the blinded template: all 48 IDs are
unique, all required judgments are present, and the language, source, candidate,
and row order are unchanged. Aggregate descriptive scores were 4.71/5 for
meaning and 4.42/5 for fluency, with two factual/polarity errors.
The reviewed CSV SHA-256 is
`2c5bec46de7ec1ea1fc2067b689392a65d5592c2f61a7ef3b0bce08ae204cac5`.

Primary comparisons use only the first 24 rows: a stable balanced sample with
three rows per language/pipeline cell. The other 24 rows deliberately enrich
automatic-system disagreements and are not a population-rate estimate. A
provisional human quality pass means meaning >= 4, fluency >= 4, and no
factual/polarity error; this threshold is exploratory, not preregistered.

| Pipeline | Balanced rows | Human quality pass | Quality-preserving conditional evasion | Mean token edits |
|---|---:|---:|---:|---:|
| Simple paraphrase | 6 | 100.0% | 40.0% (2/5) | 24.5% |
| SIRA | 6 | 66.7% | 50.0% (3/6) | 35.9% |
| BIRA | 6 | 100.0% | 80.0% (4/5) | 37.5% |
| Position-aware BIRA | 6 | 100.0% | 66.7% (4/6) | 34.1% |

The core has only six rows per pipeline, so it cannot rank BIRA against
position-aware BIRA. Across the balanced core, the LLM judge agreed with the
provisional human pass on 22/24 rows (91.7%); the deterministic/neural gate
agreed on 15/24 (62.5%) and rejected nine human-passing candidates.

One human error exposed a specific validator blind spot. A position-aware
candidate changed `Born in 1960` to `Born in 1990` and moved the political-career
decade in the other direction. The number multiset stayed unchanged, so exact
number preservation passed. The new conservative number-context validator
detects this binding swap and flags only that candidate in a post-hoc scan of
all 240 progressive selections. This diagnostic was added after the run and
must be applied prospectively before affecting headline metrics.

The independent reviewer completed the 12-row blinded reliability sheet: all
six primary quality failures plus six stable random balanced-core controls.
The reviewed CSV SHA-256 is
`4edf1d0c05747d628db05a576bbd6c3f9d21cd2e65ba8890ee565b3887d6bb5e`.
Meaning scores agree exactly on 7/12 rows (58.3%), within one point on 11/12
(91.7%), with quadratic weighted kappa 0.500. Fluency agrees exactly on 8/12
(66.7%), within one point on 11/12 (91.7%), with quadratic weighted kappa
0.563. The factual/polarity flag agrees on all 12 rows (Cohen kappa 1.000).

The thresholded quality-pass decision agrees on 9/12 rows with Cohen kappa
0.500. All three pass disagreements come from fluency scores that cross the
3-to-4 threshold, so they are especially relevant to the exploratory pass
mapping. Seven rows differ on at least one raw rating and were adjudicated. The
completed adjudication SHA-256 is
`a5a7e989b1402da35abfd15ef6faf71cd6d8814b82cd472f799070e4353ddb78`,
and the final status is `complete_two_reviewer_adjudicated`.

The 12-row adjudicated consensus passes 10/12 candidates and retains both
material errors. It changes four primary pass decisions from fail to pass: one
balanced-core SIRA row and three disagreement-extension rows. The consensus
pass agrees with reviewer 1 on 8/12 rows and reviewer 2 on 11/12, so the final
decisions are operationally more permissive than the primary review. This is a
diagnostic consensus, not a population-rate estimate.

As a post-hoc sensitivity, overlaying this consensus on the 12 reviewed rows
while retaining primary ratings for the other 36 raises balanced-core quality
pass from 22/24 to 23/24 and all-audited descriptive pass from 42/48 to 46/48.
It does not change balanced-core quality-preserving conditional evasion, which
remains 13/22 (59.1%), because the changed core candidate did not evade the
detector. SIRA's adjusted core quality pass becomes 5/6, but its
quality-preserving conditional evasion remains 3/6 (50.0%). The substantive
Gate decision is therefore unchanged.

## Decision

Keep simple paraphrasing as the operational baseline for the next experiment.
Do not promote position-aware BIRA: its apparent raw-evasion benefit is bought
with much larger edits, and its quality-preserving advantage over the simple
baseline is neither observed nor statistically established here.

The next evidence gate should:

1. run the new number-context gate prospectively alongside entity and negation
   preservation before tuning the attack ranking further;
2. preregister the pass mapping, add calibration examples around the fluency
   3-to-4 boundary, and double-score a representative balanced sample;
3. repeat with a larger held-out set and a detector calibration sample large
   enough to resolve a 1% FPR;
4. add another executable official watermark family and at least one additional
   rewriter model/provider;
5. retain the same fixed-budget grid and paired-prompt analysis.
