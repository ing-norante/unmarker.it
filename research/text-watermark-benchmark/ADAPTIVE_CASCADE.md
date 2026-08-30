# Adaptive rewrite cascade

This is the product-oriented successor to the fixed Gate 2 grid. It preserves
the old benchmark unchanged and adds an online, progressive search that stops
after the first acceptable round.

## Decision contract

For each input the runner:

1. extracts source entities with GLiNER on Modal;
2. protects entity surfaces, numbers and their local bindings, URLs, emails,
   quotations, dates, negations, and caller-supplied terminology;
3. excludes the suspected generator family when it is known, or requires at
   least two rewrite families when it is unknown;
4. generates the complete conservative round and evaluates every candidate
   before selection;
5. falls back to contextual chunks without shuffling, backtranslation, and
   outline-based structural regeneration;
6. runs position-aware BIRA only when both a compatible target detector and a
   tokenizer-compatible logit-bias route are configured;
7. applies deterministic, multilingual embedding, bidirectional NLI, blinded
   frontier-judge, target-detector, and generic-detector gates;
8. selects only from the non-dominated Pareto front and stops at the first
   accepted round.

If no candidate clears all gates, the output status is `best_effort`, never a
claim that a proprietary watermark was removed. `not_needed` means that the
source already cleared every configured detector.

## Deploy the Modal scoring functions

The cascade calls four separately pinned Modal apps so their incompatible
model dependencies and GPU memory footprints remain isolated:

```bash
uv run modal deploy modal_pipeline.py
uv run modal deploy modal_binoculars.py
uv run modal deploy modal_fast_detect_gpt.py
uv run modal deploy modal_open_detectors.py
```

These deployments expose in-memory batch functions. They do not write a new
detector corpus or start a local server. Modal may keep a warm container for
five minutes so sequential cascade rounds avoid repeated cold starts.

The adaptive resource profile keeps GLiNER, neural quality, and RADAR on L4;
the detector-only MarkLLM target runs on Modal CPU. Binoculars and
Fast-DetectGPT/LogRank retain L40S because each service holds multiple large
causal models. The self-information scorer also retains L40S.

## Configure model families

Copy `configs/adaptive-routes.example.json` and pin at least two distinct
families. A route with `bias_tokenizer` is eligible for position-aware BIRA;
token IDs from that tokenizer are never sent to a different model family.

The `generator_family` input field must use the same family identifiers as the
route configuration. When omitted, the runner uses at least two families. When
present, every route in that family is excluded.

The checked-in example names models that were already used by this research
project. Run preflight before a paid batch because provider availability can
change. Preflight rejects inactive provider endpoints and parameters not
advertised by the selected endpoint. Set `temperature` to `null` for reasoning
models that do not expose that parameter.

## Input

The input is JSONL with one stable `request_id` per item:

```json
{
  "request_id": "document-001",
  "language": "it",
  "text": "...",
  "generator_family": "qwen",
  "terminology": ["Unmarker", "Atlas"],
  "target_algorithm": null
}
```

`generator_family`, `terminology`, and `target_algorithm` are optional. Do not
set `target_algorithm` from a guess. It is valid only when the compatible
scheme, configuration, tokenizer, and key are actually available.

## Run

From `research/text-watermark-benchmark`:

```bash
uv run unmarker-adaptive-rewrite \
  --input configs/adaptive-input.example.jsonl \
  --output results/adaptive-smoke/results.jsonl \
  --routes configs/adaptive-routes.example.json \
  --calibration results/gate2b-exp-pilot-20260822-01/generic-detectors/calibration.json \
  --gliner-calibration results/gate2b-exp-pilot-20260822-01/ner-calibration/gliner-thresholds.json \
  --env-file ../../.env
```

The default ensemble is Binoculars, Fast-DetectGPT, LogRank, and RADAR. To run
a qualified subset, pass for example:

```bash
--detectors binoculars,fast_detect_gpt,radar
```

The command is item-resumable. Its manifest locks the input, route,
calibration, target, and threshold configuration. A failed item is recorded
without aborting its peers and is retried on resume; successful items are
skipped. Reusing an output path with changed inputs is
rejected; use `--no-resume` only when intentionally replacing that run.

## Compatible target and position-aware mode

Position-aware BIRA is disabled by default. To enable it, supply
`--enable-position-aware`, set `target_algorithm` on the relevant input rows,
and pass a target config such as:

```json
{
  "thresholds": {
    "EXP": {"en": 0.0, "it": 0.0}
  },
  "operators": {"EXP": "gt"}
}
```

The zeroes above illustrate the schema only. Replace them with thresholds from
the exact compatible calibration run; never use the example as evidence.

## Output

Every successful item includes:

- `cascade_status`: `accepted`, `best_effort`, or `not_needed`;
- the selected text;
- the source protection manifest;
- every attempted round and every candidate evaluation;
- detector scores, calibrated margins, deterministic and neural quality;
- frontier-judge material-error, fluency, and naturalness signals;
- model family, provider response metadata, latency, token use, and cost;
- the final Pareto-front candidate IDs and the stopping reason.

The generic calibrated margin is a signed decision margin, not a probability.
Positive values are on the detector's AI side of its language threshold;
negative values are on the clear side.

## Build a controlled holdout slice

The helper below selects only evaluation rows assigned to `held_out_test` that
were detected by the exact compatible target before rewriting. Selection is a
seeded SHA-256 ordering within each language, and the emitted manifest pins the
source hashes and eligible population:

```bash
uv run unmarker-adaptive-holdout \
  --generations results/<source-run>/modal-prepare/generations.jsonl \
  --candidates results/<source-run>/attacks/raw-candidates.jsonl \
  --output results/<adaptive-holdout> \
  --algorithm EXP \
  --per-language 5 \
  --seed 20260830 \
  --generator-family qwen
```

Pass the generated `input.jsonl` to `unmarker-adaptive-rewrite` and its
`target-config.json` through `--target-config`. A row previously used by the
fixed-grid benchmark remains an adaptive-method holdout, not a
generation-level virgin holdout; preserve that distinction in reports.

## Development model sweep

`--route-ids` runs exactly one or more named routes from a shared configuration.
This is useful for a paired model comparison because every route receives the
same frozen input rows and all other validators remain unchanged:

```bash
uv run unmarker-adaptive-rewrite \
  --input results/<sweep>/slice/input.jsonl \
  --output results/<sweep>/<model>/results.jsonl \
  --routes configs/adaptive-routes-non-qwen.json \
  --route-ids <route-id> \
  --calibration results/<source>/generic-detectors/calibration.json \
  --gliner-calibration results/<source>/ner-calibration/gliner-thresholds.json \
  --target-config results/<sweep>/slice/target-config.json \
  --detectors radar \
  --env-file ../../.env
```

Summarize only after every model has the expected number of successful rows:

```bash
uv run unmarker-adaptive-sweep-report \
  --model terra=results/<sweep>/terra/results.jsonl \
  --model grok=results/<sweep>/grok/results.jsonl \
  --model gemini=results/<sweep>/gemini/results.jsonl \
  --output results/<sweep>/report \
  --expected-count 18
```

The fixed tie-break order is full-gate acceptance, RADAR clearance, compatible
target clearance, material-error rate, edit ratio, and cost. Partial runs are
reported but cannot be selected.

## Fully fresh confirmation corpus

The prompt builder streams the pinned Wikipedia snapshot on Modal and excludes
article IDs from every supplied historical artifact. Both calibration and
evaluation prompts are new; the output manifest records source hashes and
asserts zero overlap:

```bash
uv run unmarker-adaptive-fresh-prompts \
  --exclude datasets/markllm-wikipedia-v1.jsonl \
    results/<gate2b>/modal-prepare/generations.jsonl \
    results/<gate2c>/modal-prepare/generations.jsonl \
  --output results/<fresh-run>/prompts \
  --calibration-per-language 100 \
  --evaluation-per-language 50 \
  --seed 20260831
```

Generate and calibrate official EXP against those 300 prompts, then freeze the
independent target-detected confirmation slice:

```bash
uv run modal run modal_pipeline.py \
  --stage prepare \
  --run-id <fresh-run> \
  --prompts results/<fresh-run>/prompts/prompts.jsonl \
  --output results/<fresh-run>/modal-prepare \
  --algorithms EXP \
  --calibration-prompts-per-language 100 \
  --evaluation-prompts-per-language 50 \
  --evidence-profile gate2b_exp_pilot

uv run unmarker-adaptive-fresh-slice \
  --generations results/<fresh-run>/modal-prepare/generations.jsonl \
  --output results/<fresh-run>/adaptive-slice \
  --algorithm EXP \
  --per-language 20 \
  --seed 20260831 \
  --generator-family qwen
```

Do not inspect or use fresh-corpus outcomes while choosing the development
winner. The confirmation contract is invalid if routes or thresholds are
changed after opening that corpus.
