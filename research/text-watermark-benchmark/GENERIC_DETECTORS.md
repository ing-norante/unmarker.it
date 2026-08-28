# Open generic AI detector matrix

This stage evaluates the 60 held-out AI originals and 240 selected Gate 2b
rewrites without Copyleaks or GPTZero. The primary open matrix is:

- official Binoculars on Modal;
- official Fast-DetectGPT plus the official LogRank baseline in one Modal pass;
- IBM's released RADAR classifier.

An exploratory XLM-R large classifier is run separately as a negative research
control. It was fine-tuned on pinned English COLING human/machine rows, Italian
COLING machine rows, and disjoint Italian Wikipedia human rows. It is excluded
from the primary detector intersection and every product-facing conclusion.

The benchmark does not treat native 0.5 cutoffs as comparable. Each detector is
calibrated separately for English and Italian on 1,000 independent human
controls at a target 1% FPR. A disjoint 500-control split per language estimates
the realized out-of-sample FPR. Detector scores, native decisions, calibrated
decisions, model revisions, latency, and raw diagnostic fields are retained.
The Italian controls also contain three excerpts from each of 164 chapters of
an unpublished human-written book. These 492 literary passages never fit the
threshold: they form a separate, chapter-grouped false-positive stress test.

This is evidence about detector behavior, not proof of human authorship. RADAR
is English-oriented, and published COLING shared-task results show that Italian
detection can remain near chance. Both languages therefore remain separate;
weak Italian cells must not be averaged into a positive product claim.
Fast-DetectGPT and LogRank also share the same GPT-Neo scoring model, so their
agreement is correlated evidence rather than two independent votes. The XLM-R
model is an Unmarker-trained derivative of the shared-task recipe, not an
official released detector. Its Italian human and machine classes come from
different source corpora, so its held-out literary stress result is a required
admission gate rather than an optional diagnostic.

## Reproducibility contract

The code pins:

- `ahans30/Binoculars` at
  `c8ae2f90d50ee696418bc71d8d9e5020e5f9d7b8`;
- `baoguangsheng/fast-detect-gpt` at
  `971b05202bac2bb504d60c0ac0812fea7a8f7c82`;
- GPT-J 6B at `47e169305d2e8376be1d31e765533382721b2cc1`;
- GPT-Neo 2.7B at `e24fa291132763e59f4a5422741b424fb5d59056`;
- `TrustSafeAI/RADAR-Vicuna-7B` at
  `4ff1f23a69a36aa1df47b0933be6279f1b896c9b`;
- `FacebookAI/xlm-roberta-large` at
  `c23d21b0620b635a76227c604d44e43a9f0ee389`;
- `Jinyan1/COLING_2025_MGT_multingual` at
  `da603651a8929a3790937c2c2b01bde23662111f`;
- `wikimedia/wikipedia` controls at
  `b04c8d1ceb2f5cd4588862100d08de323dccfbaa`.

The 2023 Wikipedia snapshot is pinned and excludes the benchmark article IDs,
but it is not guaranteed to be free of AI-assisted edits. It also represents
only encyclopedic prose. The independent evaluation split makes the empirical
FPR visible instead of assuming that the fitted quantile generalizes.

All commands below run from `research/text-watermark-benchmark`.

## 1. Freeze the 300 benchmark documents

```bash
uv run unmarker-generic-detectors prepare \
  --selections results/gate2b-exp-pilot-20260822-01/report/progressive-selections.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus
```

The expected contract is 300 unique texts: 30 originals and 120 rewrites per
language.

## 2. Build independent human controls

```bash
uv run --extra markllm unmarker-generic-detectors build-controls \
  --benchmark results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/documents.jsonl \
  --calibration-per-language 1000 \
  --evaluation-per-language 500 \
  --italian-book-dir datasets/private/italian-unpublished-book/chapters \
  --book-excerpts-per-chapter 3
```

This writes 3,492 length-matched human documents plus
`controls-manifest.json`: 3,000 Wikipedia calibration/evaluation controls and
492 private Italian literary stress controls. Article IDs already used to
prompt the 60 AI originals are excluded. The local `datasets/private/`
directory is ignored by Git, while the complete control JSONL is uploaded to
the existing Modal run volume by the normal scan commands.

## 3. Train the bilingual XLM-R detector once

```bash
uv run modal run modal_open_detectors.py \
  --action train-xlmr \
  --model-id xlmr-en-it-coling-v1 \
  --controls results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/documents.jsonl \
  --benchmark results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --train-per-language-label 10000 \
  --dev-per-language-label 2000 \
  --italian-train-per-label 4000 \
  --italian-dev-per-label 1000 \
  --epochs 2 \
  --max-length 256
```

The immutable model is stored in the `unmarker-open-detector-models` Modal
volume. Its training manifest contains aggregate and per-language development
accuracy and macro-F1, exact cell counts, and hashes of the control/benchmark
corpora whose Wikipedia article IDs were excluded. The resulting recipe has
28,000 train rows and 6,000 development rows. Choose a new model ID for a
different training contract; an existing completed ID is never overwritten.

## 4. Score the human controls

Run all three jobs. They are resumable under their run IDs.

```bash
uv run modal run modal_binoculars.py \
  --run-id generic-controls-v2 \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/controls

uv run modal run modal_fast_detect_gpt.py \
  --run-id generic-controls-v2 \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/controls

uv run modal run modal_open_detectors.py \
  --action scan \
  --run-id generic-controls-v2 \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/controls \
  --detectors radar,xlmr_mgt \
  --model-id xlmr-en-it-coling-v1
```

Fast-DetectGPT emits two result directories: `fast_detect_gpt` and `logrank`.
LogRank deliberately has no native Boolean decision; it becomes decidable only
after local calibration.

## 5. Fit and audit the 1% FPR thresholds

```bash
uv run unmarker-generic-detectors calibrate \
  --controls results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/documents.jsonl \
  --results \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/binoculars/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/fast_detect_gpt/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/logrank/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/radar/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/xlmr_mgt/results.jsonl \
  --target-fpr 0.01 \
  --minimum-calibration-rows 1000 \
  --minimum-evaluation-rows 500 \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/calibration.json
```

The threshold uses a strict empirical operator (`score > threshold` or
`score < threshold`) so ties cannot silently exceed the allowed calibration
false positives. Inspect `evaluation_fpr` and its Wilson interval for every
detector/language cell before using that cell in conclusions. For the private
Italian book, inspect both passage FPR and the stricter fraction of chapters
having at least one false positive. Multiple excerpts from one chapter are not
counted as independent chapters.

### Reference control result (2026-08-27)

The `generic-controls-v2` run completed all 3,492 controls with zero failed
rows for every detector. Thresholds were fitted on 1,000 controls per language;
the table below reports the disjoint 500-control evaluation FPR and the 492-row,
164-chapter Italian literary stress test.

| detector | EN eval FPR | IT eval FPR | book passage FPR | chapters with any FP |
| --- | ---: | ---: | ---: | ---: |
| Binoculars | 1.0% | 1.8% | 0.20% | 0.61% |
| Fast-DetectGPT | 0.8% | 2.6% | 0.41% | 1.22% |
| LogRank | 0.6% | 1.8% | 0.00% | 0.00% |
| RADAR | 1.6% | 1.4% | 1.22% | 3.66% |
| XLM-R derivative | 1.0% | 2.0% | 97.97% | 100.00% |

XLM-R reached aggregate development macro-F1 0.9234 (EN 0.8886, IT 0.9920),
but failed the independent Italian literary admission gate catastrophically.
That combination is consistent with a source/domain shortcut caused by using
Wikipedia for the Italian human class. The model is retained as a negative
research control, but it must not participate in product claims or detector
intersections until it is retrained on source-matched Italian human/machine
data and passes a new untouched-domain stress test.

## 6. Score the 300 benchmark texts

```bash
uv run modal run modal_binoculars.py \
  --run-id generic-benchmark-v1 \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors

uv run modal run modal_fast_detect_gpt.py \
  --run-id generic-benchmark-v1 \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors

uv run modal run modal_open_detectors.py \
  --action scan \
  --run-id generic-benchmark-v1 \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors \
  --detectors radar,xlmr_mgt \
  --model-id xlmr-en-it-coling-v1
```

The existing Binoculars result can be reused only if its corpus hash and model
contract match. Never reuse a threshold fitted on benchmark AI scores.

## 7. Produce the calibrated reports

The primary report contains only the four admitted open detectors:

```bash
uv run unmarker-generic-detectors report \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --results \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/binoculars/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/fast_detect_gpt/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/logrank/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/radar/results.jsonl \
  --calibration results/gate2b-exp-pilot-20260822-01/generic-detectors/calibration.json \
  --required-detectors binoculars,fast_detect_gpt,logrank,radar \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/report-open-primary
```

Generate a separate diagnostic report containing XLM-R when investigating its
failure mode. Do not quote its detector intersection as a benchmark result:

```bash
uv run unmarker-generic-detectors report \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --results \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/binoculars/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/fast_detect_gpt/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/logrank/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/radar/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/xlmr_mgt/results.jsonl \
  --calibration results/gate2b-exp-pilot-20260822-01/generic-detectors/calibration.json \
  --required-detectors binoculars,fast_detect_gpt,logrank,radar,xlmr_mgt \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/report-open-diagnostic
```

Both reports contain original TPR, post-rewrite detection, conditional evasion,
quality-preserving conditional evasion, score deltas, and detector
intersections. All rates have Wilson 95% intervals. A raw "passes all
detectors" rate is an operational outcome, not automatically an evasion rate.
An all-detector conditional evasion claim additionally requires every included
detector to have non-trivial original TPR on the same language and documents.

### Reference benchmark result (2026-08-28)

The immutable `generic-benchmark-v1` run scored all 300 documents with zero
failed rows and no document/hash mismatch. The corpus SHA-256 is
`0becf7bd3422f10360516522da9c7ba7ffba7ae1314b831e47dc7df3a71a7605`.
At the locally calibrated thresholds, original TPR is:

| detector | EN original TPR | IT original TPR |
| --- | ---: | ---: |
| Binoculars | 100.0% | 80.0% |
| Fast-DetectGPT | 90.0% | 46.7% |
| LogRank | 0.0% | 20.0% |
| RADAR | 100.0% | 0.0% |

Consequently, no original is eligible for a four-detector conditional evasion
claim: LogRank detects none of the 30 English originals and RADAR detects none
of the 30 Italian originals. Per-detector conditional evasion remains valid
where that detector recognized the paired original:

| language | pipeline | Binoculars | Fast-DetectGPT | LogRank | RADAR |
| --- | --- | ---: | ---: | ---: | ---: |
| EN | simple paraphrase | 46.7% | 63.0% | - | 3.3% |
| EN | SIRA | 23.3% | 37.0% | - | 6.7% |
| EN | BIRA | 80.0% | 88.9% | - | 10.0% |
| EN | BIRA position-aware | 73.3% | 81.5% | - | 16.7% |
| IT | simple paraphrase | 66.7% | 78.6% | 33.3% | - |
| IT | SIRA | 54.2% | 64.3% | 33.3% | - |
| IT | BIRA | 66.7% | 85.7% | 50.0% | - |
| IT | BIRA position-aware | 54.2% | 78.6% | 83.3% | - |

`-` means that the detector recognized zero paired originals in that language,
so conditional evasion is undefined. The Italian LogRank percentages have only
six eligible originals and therefore wide uncertainty.

As an operational outcome, the counts below show rewrites that pass all four
primary detectors, followed by the subset that also passed the prospective
automatic quality gate (protected-content, semantic, NLI, and API-completion
checks):

| language | pipeline | passes all | passes all + quality |
| --- | --- | ---: | ---: |
| EN | simple paraphrase | 1/30 | 0/30 |
| EN | SIRA | 1/30 | 0/30 |
| EN | BIRA | 3/30 | 0/30 |
| EN | BIRA position-aware | 4/30 | 1/30 |
| IT | simple paraphrase | 19/30 | 18/30 |
| IT | SIRA | 16/30 | 9/30 |
| IT | BIRA | 18/30 | 13/30 |
| IT | BIRA position-aware | 17/30 | 13/30 |

For context, 0/30 English originals and 3/30 Italian originals already pass all
four detectors before rewriting. This is another reason to retain paired,
per-detector conditional metrics beside the operational pass counts.

The automatic-quality column is not a population-wide human verdict. The
completed two-reviewer adjudication covers the separately sampled 48-row human
audit; it is reported in `GATE2B_RESULTS.md` and must not be projected onto all
240 rewrites.

The primary evidence therefore supports strong evasion against Binoculars and
Fast-DetectGPT, but not a detector-agnostic success claim: English RADAR remains
hard to evade, while Italian RADAR and English LogRank lack baseline power.
XLM-R classified 60/60 originals and almost every rewrite as AI, but it also
misclassified 482/492 unpublished human book excerpts. This confirms its role
as a source-shortcut negative control rather than evidence against the
rewrites.

## 8. Run the paired algorithm-selection gate

The selection gate admits a detector/language cell only when held-out human FPR
is at most 3%, original TPR is at least 70%, and the original-TPR Wilson lower
bound is at least 50%. The Italian book passage FPR must also be at most 3%.
It then restricts the paired population to sources recognized before rewriting
by EXP and every admitted detector for that language.

```bash
uv run unmarker-generic-detectors select-algorithm \
  --joined-results results/gate2b-exp-pilot-20260822-01/generic-detectors/report-open-primary/joined-results.jsonl \
  --calibration results/gate2b-exp-pilot-20260822-01/generic-detectors/calibration.json \
  --judge-evaluations results/gate2b-exp-pilot-20260822-01/judge/llm-judge.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/algorithm-selection
```

The primary paired outcome requires the EXP watermark and every admitted
generic detector to be evaded while the prospective automatic quality gate
passes. The blinded LLM screen is retained as a sensitivity analysis, not
human ground truth. Comparisons use exact McNemar tests, Holm correction, and a
language-stratified paired bootstrap. XLM-R input is rejected by construction.

On the reference run, the admitted cells are Binoculars EN/IT,
Fast-DetectGPT EN, and RADAR EN. Simple paraphrasing is the stable provisional
winner under both automatic and LLM quality mappings, with fewer edits, but it
does not pass multiplicity-adjusted statistical confirmation. A fresh corpus
is therefore required before promotion.

### Independent confirmation corpus

Build the confirmation prompt set from the locked calibration prompts and
evaluation prompts not used by the selection run:

```bash
uv run unmarker-generic-detectors prepare-confirmation-prompts \
  --prompt-pool datasets/markllm-wikipedia-v1.jsonl \
  --previous-generations results/gate2b-exp-pilot-20260822-01/modal-prepare/generations.jsonl \
  --output results/gate2c-exp-confirmation-20260828-01/prompts
```

The Modal prepare stage can seed calibration records from the prior immutable
run. Seeding is accepted only when the gate, backend, prompt text, algorithm,
language, split, and deterministic sample seed match. Evaluation records are
never seeded.

```bash
uv run --extra modal modal run modal_pipeline.py \
  --stage prepare \
  --run-id gate2c-exp-confirmation-v1 \
  --prompts results/gate2c-exp-confirmation-20260828-01/prompts/prompts.jsonl \
  --algorithms EXP \
  --calibration-prompts-per-language 100 \
  --evaluation-prompts-per-language 50 \
  --evidence-profile gate2b_exp_pilot \
  --seed-calibration-run-id gate2b-exp-pilot-20260822-01 \
  --output results/gate2c-exp-confirmation-20260828-01/modal-prepare
```

Use `gate2c-exp-confirmation` for the attack. It freezes the same four
pipelines, 20/30 development/held-out split, approved GLiNER quality profile,
and OpenRouter route as Gate 2b while disabling the already-measured adaptive
oracle and re-stamp controls.

## Local fallback

RADAR or the trained XLM-R model can also be scanned with
`unmarker-generic-detectors scan-local` after installing the `detectors` extra.
This is a portability fallback, not the reference run; the reference artifacts
come from the pinned Modal images.

## Tests and static checks

```bash
uv run python -m unittest discover -s tests -v
uv run python -m py_compile \
  modal_binoculars.py modal_fast_detect_gpt.py modal_open_detectors.py
```

No commercial detector credentials and no Codex/ChatGPT quota are required.
Modal GPU execution still incurs Modal compute usage.
