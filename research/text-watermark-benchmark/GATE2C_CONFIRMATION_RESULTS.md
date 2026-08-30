# Gate 2c independent confirmation results

Run: `gate2c-exp-confirmation-v1`, completed on 2026-08-30.

## Decision

The independent confirmation does **not** validate a general-purpose text
watermark removal algorithm. The discovery winner, simple paraphrasing, did not
replicate: position-aware BIRA was the provisional winner on the new corpus,
but its advantage was small, statistically inconclusive, and obtained with
almost twice as many token edits. No pipeline achieved a single automatic
quality-preserving robust success on the eligible English population because
RADAR remained effective after rewriting.

Keep simple paraphrasing as the quality and edit-cost baseline. Keep
position-aware BIRA as a research candidate for a detector-aware escalation
stage. Neither is ready to support a product claim that it reliably makes AI
text pass heterogeneous detectors.

This conclusion concerns the reproduced EXP watermark and the pinned open
detectors in this benchmark. It is not evidence about Claude or any undisclosed
production watermark.

## Frozen confirmation design

- 100 never-used evaluation prompts: 50 English and 50 Italian;
- 200 calibration records reused only after exact contract verification;
- official MarkLLM EXP generation and detection;
- Qwen3-235B-A22B constrained rewriting through a provider-pinned DeepInfra
  route on OpenRouter;
- four pipelines and three fixed budgets, producing 1,200 candidates;
- 20-development/30-held-out prompts per language;
- GLiNER protected spans, deterministic validators, multilingual embeddings,
  and bidirectional NLI on Modal;
- blinded GPT-5.6 Terra quality pre-screen for all 240 progressive selections;
- 300-document open-detector corpus: 60 originals and 240 rewrites;
- Binoculars, Fast-DetectGPT, LogRank, RADAR, and diagnostic-only XLM-R on
  Modal.

The OpenRouter attack completed 1,320/1,320 calls with no retries, truncations,
or missing candidates. Rewriting cost was $0.2063; Modal GPU cost is not
included. The judge backend reported zero metered cost for this run.

## Target watermark and quality

Across the full 1,200-candidate fixed-budget grid, the post-attack EXP TPR was
20.9% and the prospective automatic quality-pass rate was 52.8%. These
aggregate grid values do not select an algorithm.

On the progressive selections, the blinded LLM screen passed 78.3%, reported a
16.7% material-error rate, and assigned mean fluency 4.78/5 and naturalness
4.82/5. It is a sensitivity analysis, not human ground truth. The generated
48-row human-review sheet remains pending, but additional review cannot repair
the English detector failure or the lack of statistical confirmation.

## Generic-detector qualification

Every detector completed 300/300 documents with zero errors. Thresholds were
reused from independent human controls; benchmark AI scores did not participate
in calibration.

| Detector | EN original TPR | IT original TPR | Decision use |
| --- | ---: | ---: | --- |
| Binoculars | 93.3% | 83.3% | admitted EN/IT |
| Fast-DetectGPT | 93.3% | 36.7% | admitted EN only |
| LogRank | 0.0% | 30.0% | rejected |
| RADAR | 100.0% | 0.0% | admitted EN only |
| XLM-R | 100.0% | 100.0% | negative control only |

XLM-R remains excluded because its earlier independent unpublished Italian
book control produced a 97.97% false-positive rate. Its apparent 100% TPR here
is therefore not valid evidence.

The paired selection population contains 23 English and 22 Italian sources
that were detected before rewriting by EXP and every admitted generic detector
for that language.

## Paired robust outcome

A success requires target EXP evasion, evasion of every admitted generic
detector for the language, and the specified quality mapping on the same
initially detected source.

| Pipeline | Automatic-quality success | LLM-quality sensitivity | Automatic quality pass | LLM quality pass | Mean token edits |
| --- | ---: | ---: | ---: | ---: | ---: |
| Simple paraphrase | 2/45 (4.4%) | 3/45 (6.7%) | 82.2% | 91.1% | 22.5% |
| SIRA | 2/45 (4.4%) | 3/45 (6.7%) | 68.9% | 60.0% | 27.1% |
| BIRA | 6/45 (13.3%) | 8/45 (17.8%) | 53.3% | 80.0% | 42.1% |
| Position-aware BIRA | 6/45 (13.3%) | 8/45 (17.8%) | 62.2% | 84.4% | 41.8% |

All automatic-quality robust successes occurred in Italian. English automatic
success was 0/23 for every pipeline. Under the LLM quality sensitivity, only
SIRA achieved one English robust success; the other pipelines remained at
zero.

Position-aware BIRA's automatic risk difference against simple paraphrasing
was +8.9 percentage points, with a language-stratified bootstrap 95% interval
of 0.0 to 20.0 points. The exact McNemar p-value was 0.2188 and the Holm-adjusted
p-value was 0.6563. It tied standard BIRA and was not statistically confirmed.

## Replication check

The discovery and confirmation winners disagree:

| Run | Provisional winner | Simple automatic | Position-aware automatic | Winner confirmed? |
| --- | --- | ---: | ---: | --- |
| Gate 2b discovery | Simple paraphrase | 10/49 | 4/49 | no |
| Gate 2c confirmation | Position-aware BIRA | 2/45 | 6/45 | no |

A descriptive, non-preregistered pooling of both independent populations gives:

| Pipeline | Automatic-quality success | LLM-quality sensitivity | Weighted mean token edits |
| --- | ---: | ---: | ---: |
| Simple paraphrase | 12/94 (12.8%) | 11/94 (11.7%) | 22.7% |
| SIRA | 6/94 (6.4%) | 7/94 (7.4%) | 34.3% |
| BIRA | 9/94 (9.6%) | 14/94 (14.9%) | 40.4% |
| Position-aware BIRA | 10/94 (10.6%) | 14/94 (14.9%) | 44.5% |

This pooled table is descriptive only. Its sensitivity to the quality mapping,
the winner reversal, and the absence of multiplicity-adjusted significance all
argue against promotion.

## Recommended next experiment

Do not spend another full grid on the same rewriter and prompts. The next gate
should target the demonstrated bottleneck:

1. retain simple paraphrasing as the low-edit first stage;
2. retain position-aware BIRA only as an escalation candidate;
3. add two rewriter families whose output distribution differs from Qwen;
4. use the same untouched English controls and require prospective RADAR
   evasion before expanding the Italian experiment;
5. preregister a minimum robust success rate and a maximum edit/error rate;
6. run representative double-blind human review only for candidates that pass
   the detector gate.

## Reproducibility anchors

- final MarkLLM report SHA-256:
  `296f2251ee8a5e2b63e3bfa714041731265594d91368ab3caeee92145813ebce`;
- primary generic-detector report SHA-256:
  `666ea7a75d4cd255879235b9f791b261fd0707bd0ad3f7c7669d1d0e8ab4cab6`;
- algorithm-selection summary SHA-256:
  `98d07c93f0834904d75263bd1548f5c9ceb1d25a9aa96dfe71924d36619fe10b`.
