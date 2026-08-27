# Open generic AI detector matrix

This stage evaluates the 60 held-out AI originals and 240 selected Gate 2b
rewrites without Copyleaks or GPTZero. The primary open matrix is:

- official Binoculars on Modal;
- official Fast-DetectGPT plus the official LogRank baseline in one Modal pass;
- IBM's released RADAR classifier;
- an XLM-R large classifier fine-tuned on a pinned, balanced English/Italian
  subset of the COLING 2025 multilingual machine-generated-text corpus.

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
official released detector.

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
  --train-per-language-label 10000 \
  --dev-per-language-label 2000 \
  --epochs 2 \
  --max-length 256
```

The immutable model is stored in the `unmarker-open-detector-models` Modal
volume. Its training manifest contains aggregate and per-language development
accuracy and macro-F1. Choose a new model ID for a different training contract;
an existing ID is never overwritten.

## 4. Score the human controls

Run all three jobs. They are resumable under their run IDs.

```bash
uv run modal run modal_binoculars.py \
  --run-id generic-controls-v1 \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/controls

uv run modal run modal_fast_detect_gpt.py \
  --run-id generic-controls-v1 \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/controls/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/controls

uv run modal run modal_open_detectors.py \
  --action scan \
  --run-id generic-controls-v1 \
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

## 7. Produce the calibrated report

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
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/report-open
```

The report contains original TPR, post-rewrite detection, conditional evasion,
quality-preserving conditional evasion, score deltas, and the intersection of
all detectors. All rates have Wilson 95% intervals. The intersection is useful
only when the matrix is complete and every included detector/language cell has
acceptable held-out control FPR and non-trivial original TPR.

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
