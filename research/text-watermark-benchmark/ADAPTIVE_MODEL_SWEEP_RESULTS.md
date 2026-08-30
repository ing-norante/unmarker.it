# Non-Qwen development model sweep

## Decision

`x-ai/grok-4.6` at low reasoning is the development winner and is frozen for
the independent confirmation run. It produced 9/18 full-gate acceptances,
compared with 3/18 for `openai/gpt-5.6-terra` and 2/18 for
`google/gemini-3.7-flash`.

This promotes Grok only to the confirmation stage. A 50% development success
rate with a 95% Wilson interval of 29.0–71.0% is not evidence of a reliable
production remover.

## Frozen comparison

The paired input contains the 18 English Gate 2c development documents that
were detected by compatible official EXP before rewriting. All 18 were also
RADAR-positive at the cascade baseline for every model, so RADAR clearance is
conditional evasion rather than credit for already-clear inputs.

Every route used the same input order, compatible EXP target, calibrated
English RADAR gate, GLiNER protection, deterministic validators, multilingual
similarity/NLI, and Terra pair judge. Terra and Gemini used medium reasoning.
The original Grok medium attempt did not complete its first document in more
than seven minutes and is retained as a diagnostic artifact; the completed,
predeclared Grok run used low reasoning with 2,048 output tokens and an 8,192
token length retry ceiling. Provider-portable seeds were constrained to signed
INT32 before these completed runs.

| Route | Full gate | RADAR clear | EXP clear | Quality pass | Protected pass | Material error | Mean token change | Median latency | Total API cost |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Grok 4.6 low | 9/18 (50.0%) | 11/18 (61.1%) | 16/18 (88.9%) | 17/18 | 17/18 | 1/18 | 28.3% | 247.0 s | $1.6345 |
| GPT-5.6 Terra medium | 3/18 (16.7%) | 4/18 (22.2%) | 15/18 (83.3%) | 18/18 | 18/18 | 0/18 | 30.2% | 59.4 s | $0.9075 |
| Gemini 3.7 Flash medium | 2/18 (11.1%) | 5/18 (27.8%) | 11/18 (61.1%) | 17/18 | 18/18 | 0/18 | 29.9% | 117.3 s | $0.6086 |

The single Grok material error was a repetitive, unnatural contextual rewrite.
The quality and protection gates rejected it, so it did not contribute to the
9 accepted cases.

## Paired evidence

On the identical 18 requests:

- Grok versus Gemini: 7 Grok-only acceptances, 0 Gemini-only, 2 both;
  exact two-sided McNemar p = 0.015625.
- Grok versus Terra: 7 Grok-only acceptances, 1 Terra-only, 2 both;
  exact two-sided McNemar p = 0.0703125.
- Terra versus Gemini: 2 Terra-only, 1 Gemini-only, 1 both;
  exact two-sided McNemar p = 1.0.

The Grok/Gemini difference is persuasive on this development slice. The
Grok/Terra comparison points in the same direction but remains uncertain at
this sample size. The preregistered ranking nevertheless selects Grok because
full-gate acceptance is the primary engineering objective; latency and cost
are later tie-breakers.

## What this establishes

The model family matters materially. On this slice, Grok preserved meaning
while disrupting RADAR more often than the other two families, and it usually
also cleared compatible EXP. The gain is not explained by initially clear
RADAR documents or by relaxing quality gates.

The result is still development evidence only:

- there are 18 English documents from one generator and one domain;
- RADAR is the only generic detector in the selection loop;
- the common frontier judge is Terra, so it is not family-independent for the
  Terra route;
- Grok's useful profile is substantially slower and more expensive;
- the comparison does not address a proprietary Claude watermark.

The next decision comes exclusively from the fully fresh bilingual corpus,
using Grok unchanged against Binoculars, Fast-DetectGPT, LogRank, RADAR, and
compatible EXP. No route, threshold, or quality gate may be retuned from those
confirmation outcomes.
