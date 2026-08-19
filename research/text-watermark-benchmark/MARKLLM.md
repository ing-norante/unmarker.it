# Remote MarkLLM benchmark

This is the evidence pipeline after the dependency-free Gate 1 harness. Model
inference and MarkLLM run on Modal GPUs; constrained rewriting runs through
OpenRouter. No Ollama server or local model weights are required.

The pipeline is deliberately batch-oriented and checkpointed. It is not a
production text-rewriting backend.

## Reproducibility boundary

Pinned components:

- MarkLLM: `THU-BPM/MarkLLM` at
  `c45ddc40f7b761beabe55a1b8dc4690e531d1c6d`;
- corpus generator and target tokenizer: `Qwen/Qwen3-14B` at
  `40c069824f4251a91eefaf281ebe4c544efd3e18`;
- causal self-information scorer: `Qwen/Qwen3-8B` at
  `b968826d9c46dd6066d109eabc6255188de91218`;
- OpenRouter rewriter: `qwen/qwen3.8-2.4t-a95b`;
- its logit-bias tokenizer: `Qwen/Qwen3.8-2.4T-A95B` at
  `207bd685a7e3696cfaff12ded7c6a7ea0f88c996`;
- semantic model: `paraphrase-multilingual-mpnet-base-v2` at
  `4328cf26390c98c5e3c738b4460a05b95f4911f5`;
- multilingual NLI model: `mDeBERTa-v3-base-mnli-xnli` at
  `8adb042d524ecd5c26d3e3ba0e3fbcf7e2d0864c`.

The Modal image also pins Python dependencies. Every resumable stage stores an
input manifest and refuses to combine artifacts whose input hashes or model
configuration differ.

The SIRA and BIRA stages reproduce the papers' algorithmic procedures while
adapting inference to one OpenRouter model:

- SIRA: full reference paraphrase, teacher-forced self-information ranking,
  exact-budget masking, then reference-conditioned reconstruction;
- BIRA: self-information-ranked source token types encoded with the target
  rewriter tokenizer and suppressed through `logit_bias`; beta is calibrated
  on clean calibration texts and adaptively relaxed on degeneration;
- position-aware BIRA: the same BIRA procedure, with a dispersed first pass
  through ranked token positions before filling the exact budget.

This is an API-compatible reproduction, not an unmodified execution of the
authors' model-specific scripts. Provenance is pinned to:

- SIRA: `Allencheng97/Self-information-Rewrite-Attack` at
  `eeae0b50bc64bed3e9730ef43d48da5a182983a0`;
- BIRA: `ml-postech/LLM-Watermark-Evasion-via-Bias-Inversion` at
  `6f62ecce6f3410514fd43a40583a4059822af73a`.

## Experimental design

The corpus contains 400 independent prompts: 100 calibration and 100
evaluation prompts for each of English and Italian. Evaluation text is
watermarked independently with MarkLLM KGW, Unigram, and SynthID. Clean
calibration generations set a separate 1% FPR threshold for every
algorithm/language cell.

All four attacks are generated at 15%, 35%, and 65% budgets. This produces an
uncensored fixed-budget grid. Evaluation source prompts are then divided into
a deterministic 25% development split and a 75% held-out split. Development
data fits a scalar attack-time surrogate based on weighted self-information
retention. The progressive policy is identical for every pipeline: try the
three budgets in order and stop at the first candidate that passes the
surrogate and all quality gates. Target MarkLLM decisions from held-out prompts
never participate in selection.

Quality requires all of the following:

- exact multiset preservation of extracted entities, numbers, URLs, email
  addresses, quotations, and negations;
- multilingual sentence similarity of at least 0.90;
- bidirectional multilingual NLI entailment of at least 0.80.

`human-review.csv` is produced with blank blinded rating fields. Human
evaluation remains required before promotion.

## Setup

From `research/text-watermark-benchmark`:

```bash
uv venv --python 3.11
uv pip install -e '.[remote,modal]'
modal setup
```

`modal setup` is only needed if the machine does not already have an active
Modal profile. Model weights are cached in the `unmarker-huggingface-cache`
Modal Volume. Run artifacts are checkpointed in `unmarker-markllm-runs`.

The OpenRouter stage reads `OPENROUTER_API_KEY`. It can be set in the shell or
loaded from a named env file with `--env-file`; the value is never written to
an artifact or printed. Do not commit that env file.

## 1. Generate and score on Modal

```bash
.venv/bin/modal run modal_pipeline.py \
  --stage prepare \
  --run-id markllm-qwen3-v1 \
  --output results/modal-markllm-qwen3-v1
```

This runs Qwen3-14B with the official MarkLLM logits processors, calibrates the
detectors, then uses Qwen3-8B to calculate token self-information. Generated
continuations exclude their prompts before detection. Thinking is disabled.

Inspect `corpus-summary.json` before spending on rewrites. Every
algorithm/language cell should have adequate length, plausible held-out FPR,
and strong pre-attack TPR. Manually inspect both languages as well.

## 2. Estimate OpenRouter calls

```bash
.venv/bin/unmarker-remote-bench estimate \
  --generations results/modal-markllm-qwen3-v1/generations.jsonl
```

With 200 evaluation prompts and three watermark schemes, the complete grid has
600 watermark cases. Its theoretical minimum is 7,820 OpenRouter requests:
13 per case plus 20 clean beta-calibration calls. Adaptive BIRA retries can
increase this. Always run the estimator and a bounded pilot first.

## 3. Run a bounded OpenRouter pilot

```bash
.venv/bin/unmarker-remote-bench attack \
  --generations results/modal-markllm-qwen3-v1/generations.jsonl \
  --scores results/modal-markllm-qwen3-v1/token-scores.jsonl \
  --output results/remote-pilot/attacks \
  --env-file /absolute/path/to/private.env \
  --max-evaluation-prompts-per-language 4
```

For an even smaller infrastructure smoke, add `--pipelines bira --algorithms
KGW`. Do not compare algorithms or promote a method from a filtered run.

The client performs a live provider capability check before the first paid
request. The default route is fixed to DeepInfra with fallbacks disabled because
that endpoint accepts `logit_bias` in a real request. Together currently
advertises the parameter but rejects it when speculative decoding is active.
If availability changes, select another provider only after a real smoke call,
not only the endpoint metadata preflight.
Actual provider, returned model, request ID, token usage, API cost, latency,
beta, and a hash of biased token IDs are recorded per call.

The selected Qwen endpoint requires reasoning. Requests therefore use its
lowest actually supported `low` effort and exclude the reasoning trace from the
response; reasoning tokens still count toward usage and cost. This setting is
recorded in the attack manifest. The completion cap is 4,096 tokens so
mandatory reasoning cannot consume the whole allowance on a 192-token rewrite;
only actually used tokens are billed.

The stage resumes from `api-calls.jsonl`, `beta-calibration.json`, and
`raw-candidates.jsonl`. Reusing an output directory with different inputs or
configuration is rejected.

## 4. Detect and validate on Modal

```bash
.venv/bin/modal run modal_pipeline.py \
  --stage evaluate \
  --run-id markllm-qwen3-v1 \
  --candidates results/remote-pilot/attacks/candidates.jsonl \
  --output results/remote-pilot/modal
```

This uploads only candidate text, runs the pinned official MarkLLM detectors,
and computes multilingual embedding and NLI quality. The result is
`candidate-evaluations.jsonl`.

## 5. Finalize held-out metrics

```bash
.venv/bin/unmarker-remote-bench finalize \
  --candidates results/remote-pilot/attacks/candidates.jsonl \
  --evaluations results/remote-pilot/modal/candidate-evaluations.jsonl \
  --api-calls results/remote-pilot/attacks/api-calls.jsonl \
  --output results/remote-pilot/report
```

The report contains fixed-budget and progressive held-out tables with:

- target TPR at the clean-calibrated 1% FPR threshold;
- conditional and quality-preserving evasion rates;
- token edit distance and changed-token ratio;
- exact entity and number preservation;
- semantic similarity and bidirectional NLI;
- observed OpenRouter latency, cost, and cost per 1,000 tokens;
- selected-budget distribution and surrogate pass rate.

Repeat step 3 without the prompt limit only after the pilot artifacts look
correct. Use a new output directory and, for a formal run, a new immutable run
ID.

## Artifacts and interpretation

The main files are:

- Modal prepare: `generations.jsonl`, `corpus-summary.json`,
  `token-scores.jsonl`, and their manifests;
- OpenRouter attacks: `api-calls.jsonl`, `beta-calibration.json`,
  `candidates.jsonl`, and `attack-summary.json`;
- Modal evaluation: `candidate-evaluations.jsonl` and manifest;
- finalization: `summary.json`, `REPORT.md`,
  `progressive-selections.jsonl`, `human-review.csv`, and the separate blind
  key.

The result applies only to the reproduced MarkLLM algorithms and the pinned
models. It does not establish removal of Claude's watermark or evasion of an
undisclosed production detector.

## Verified integration smoke

On 2026-08-19, `integration-smoke-20260819` completed the Modal `prepare`
stage on an L40S with the four-row integration fixture. It produced 12 corpus
records (four unique clean generations plus six watermarked generations) and
10 unique Qwen3-8B score records; every generated continuation was 191-192
tokens. The run also confirmed that Qwen3 declares a 151,936-token model
vocabulary while `len(tokenizer)` is 151,669. The detector adapter therefore
uses the pinned model config's vocabulary size, matching watermark generation.

A bounded BIRA/KGW OpenRouter run then completed six candidates from two
watermark cases plus two beta-calibration calls. All eight responses came from
DeepInfra with `finish_reason=stop`; observed API cost was $0.04081 and summed
latency was 79.9 seconds. The candidates completed the Modal MarkLLM and neural
quality evaluation stage as well. Together advertised `logit_bias` but rejected
it in combination with speculative decoding, which is why it is not the
default. The smoke has no held-out prompts and therefore produces no headline
progressive result. These checks validate integration only; the tiny fixture
has no statistical meaning.
