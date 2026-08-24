# Generic AI detector matrix

This stage evaluates the 60 held-out AI originals and the 240 selected Gate 2b
rewrites with three detectors that do not know the EXP watermark key:

- Copyleaks AI Text Detector API;
- GPTZero v2 API;
- the official Binoculars implementation on a Modal L40S.

It answers whether the rewrites stop being classified as AI-like by these
independent detectors. It does **not** establish provenance, prove human
authorship, or report TPR at 1% FPR. The 300-document corpus contains no
independent human controls, so commercial provider labels and Binoculars'
published global threshold cannot be recalibrated here.

## Reproducibility contract

`prepare` reads `progressive-selections.jsonl`, verifies that every held-out
sample has exactly the four benchmark pipelines, deduplicates the original text,
and emits:

- `documents.jsonl`: 60 originals plus 240 rewrites;
- `manifest.json`: source and corpus hashes, counts, length checks, and schema.

Every detector result is joined by `document_id` and `text_sha256`. API runs use
an append-only checkpoint, retry 429/5xx responses, resume successful calls, and
compact the checkpoint into a canonical `results.jsonl`. Raw provider responses,
model versions, latency, request IDs, and billable units (when returned) are
retained; credentials are never written to artifacts.

Binoculars is isolated from the MarkLLM image because its official stack uses
Transformers 4.31. The Modal job pins:

- `ahans30/Binoculars` at `c8ae2f90d50ee696418bc71d8d9e5020e5f9d7b8`;
- `tiiuae/falcon-7b` at `ec89142b67d748a1865ea4451372db8313ada0d8`;
- `tiiuae/falcon-7b-instruct` at
  `8782b5c5d8c9290412416618f36a133653e85285`;
- the official low-FPR score threshold `0.8536432310785527` and 512-token cap.

That threshold was not fitted on this corpus and is especially exploratory for
Italian. The report keeps English and Italian separate.

## Run the 300-document matrix

Run all commands from `research/text-watermark-benchmark`.

### 1. Build and verify the corpus

```bash
uv run unmarker-generic-detectors prepare \
  --selections results/gate2b-exp-pilot-20260822-01/report/progressive-selections.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus
```

The expected contract is exactly 300 unique texts: 30 originals and 120
rewrites per language. All current texts also pass Copyleaks' 255-character
minimum.

### 2. Run Binoculars on Modal

```bash
uv run modal run modal_binoculars.py \
  --run-id gate2b-generic-20260824 \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors
```

The first run builds a separate image and downloads both pinned Falcon models to
the existing Hugging Face cache volume. The remote checkpoint is committed after
each batch. Re-running the same command with the same run ID resumes without
rescoring completed documents. A different corpus under the same run ID is
rejected.

### 3. Configure the commercial APIs

Add these variables to a private env file (the repository root `.env` is
accepted):

```dotenv
COPYLEAKS_EMAIL=...
COPYLEAKS_API_KEY=...
GPTZERO_API_KEY=...
```

The production Copyleaks run consumes credits. Its default sensitivity is 2,
`sandbox` is false, and `explain` is false. The GPTZero adapter uses the provider
default model and records the version when the response exposes it.

### 4. Run the API detectors

```bash
uv run unmarker-generic-detectors scan-api \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors \
  --env-file ../../.env \
  --detectors copyleaks,gptzero \
  --max-workers 2
```

This schedules 300 calls per commercial detector. Re-running resumes successful
documents and retries failures. To isolate credentials or quota, either detector
can be selected alone. `--copyleaks-sandbox` is only an integration check: its
mock outputs must not enter the evidence report.

### 5. Build the complete report

```bash
uv run unmarker-generic-detectors report \
  --manifest results/gate2b-exp-pilot-20260822-01/generic-detectors/corpus/documents.jsonl \
  --results \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/copyleaks/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/gptzero/results.jsonl \
    results/gate2b-exp-pilot-20260822-01/generic-detectors/binoculars/results.jsonl \
  --required-detectors copyleaks,gptzero,binoculars \
  --output results/gate2b-exp-pilot-20260822-01/generic-detectors/report
```

The main outputs are `summary.json`, `joined-results.jsonl`, and `REPORT.md`.
Metrics are split by detector, language, and pipeline:

- original AI detection rate;
- post-rewrite AI detection rate;
- conditional evasion only where that detector recognized the original;
- quality-preserving conditional evasion using the existing Gate 2b quality
  decision;
- detector-score change;
- pass-all-detectors intersection on complete rows.

Every binomial rate includes a Wilson 95% interval. “Quality-preserving
conditional evasion” uses every detector-recognized original as its denominator
and counts a success only when the rewrite both evades that detector and passes
the existing Gate 2b quality decision.

Do not rank algorithms from the pass-all intersection unless all three detector
matrices are complete. Do not relabel these native-score results as
`TPR@1%FPR`; that requires a new, matched human-control corpus and detector-level
threshold calibration.

## Tests

```bash
uv run python -m unittest discover -s tests -v
```

The tests cover corpus integrity, provider response normalization, secret-free
artifacts, resume behavior, conditional evasion, and cross-detector joins. They
use fake HTTP transports and consume no provider credits.
