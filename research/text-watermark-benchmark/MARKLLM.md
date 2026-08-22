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
- OpenRouter rewriter: `qwen/qwen3-235b-a22b-2507` on the DeepInfra FP8 route;
- its logit-bias tokenizer: `Qwen/Qwen3-235B-A22B-Instruct-2507` at
  `ac9c66cc9b46af7306746a9250f23d47083d689e`;
- semantic model: `paraphrase-multilingual-mpnet-base-v2` at
  `4328cf26390c98c5e3c738b4460a05b95f4911f5`;
- multilingual NLI model: `mDeBERTa-v3-base-mnli-xnli` at
  `8adb042d524ecd5c26d3e3ba0e3fbcf7e2d0864c`;
- entity model: `urchade/gliner_multi-v2.1` at
  `443d26d654e0324125a96bebd8e796c14ff2efe6`, served with
  `gliner==0.2.24`;
- blinded quality judge: `openai/gpt-5.6-terra` through the OpenAI route on
  OpenRouter, with medium reasoning, deterministic seeds, and strict
  structured output.

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

MarkLLM detector scores are put on one common axis before calibration. EXP and
EXPGumbel return p-values where lower means more watermarked, so the adapter
records and uses `-log10(p)`; the other configured schemes retain their native
higher-is-more-watermarked score.

The default Modal run includes official MarkLLM `EXP`. It uses MarkLLM's native
token-by-token generation method with `sequence_length=192`, not an approximate
logits-processor replacement. `EXPGumbel` is supported by the adapter only when
the official implementation fits a configured memory guard. With Qwen3's
151,936-token vocabulary, official MarkLLM allocates both uniform and Gumbel
float32 tables of shape `(V * 2, V)`: approximately 344 GiB (369 GB) together. The
adapter rejects that configuration before allocation. Therefore EXPGumbel is
not in the Qwen3 Modal matrix; EXP is the executable official representative of
the exponential/Gumbel family. This exclusion is a resource constraint, not an
experimental result.

## Experimental design

The corpus contains 400 independent prompts: 100 calibration and 100
evaluation prompts for each of English and Italian. Evaluation text is
watermarked independently with MarkLLM KGW, Unigram, SynthID, and EXP. Clean
calibration generations set a separate 1% FPR threshold for every
algorithm/language cell.

All four attacks are generated at 15%, 35%, and 65% budgets. This produces an
uncensored fixed-budget grid. Evaluation source prompts are then divided into
a deterministic development split and a held-out split. Development data fits
a scalar attack-time surrogate based on weighted self-information retention.
One threshold is fitted per watermark algorithm/language and shared by every
rewrite pipeline. It is enabled only if development precision reaches 0.80;
otherwise every pipeline evaluates all three budgets. Target MarkLLM decisions
from held-out prompts never participate in selection.

Two diagnostic controls are generated separately from that grid:

- `adaptive_oracle_paraphrase` precomputes up to three full paraphrases per
  watermark case, then simulates stopping at the first quality-passing rewrite
  that evades the target detector. Because it uses the target outcome, it is an
  upper-bound baseline and is never fitted or ranked as a candidate algorithm;
- `restamp_control` paraphrases each unique clean generation once, shares that
  call across watermark detectors, and measures clean FPR before/after plus
  false-positive introduction.

All rewriter outputs pass through conservative Unicode hygiene. The cleaned
text and the full action audit are stored together; NFKC is off.

Quality requires all of the following:

- exact multiset preservation of GLiNER-manifested entities plus deterministic
  numbers, URLs, email addresses, quotations, and negations;
- multilingual sentence similarity of at least 0.90;
- bidirectional multilingual NLI entailment of at least 0.80.

GLiNER runs once on every source before rewriting and its versioned manifest is
used both in constrained prompts and validation. Modal extracts candidate
entities again. A candidate-only entity surface is a hard failure only when
that surface does not occur in the original text; this avoids treating
context-dependent span segmentation as a new fact. Language-specific
thresholds must come from 50 English and 50 Italian rows with human gold
annotations. The reproducible pilot source uses the shared PER/ORG/LOC schema
from UNER English-EWT and KIND Wikinews. Their repository commits and file
hashes are pinned, and the calibrated label set is propagated to extraction
and candidate validation. An automatically generated draft is never labeled
as approved.

`human-review.csv` is produced with blank blinded rating fields. Human
evaluation remains required before promotion.

## Setup

From `research/text-watermark-benchmark`:

```bash
uv venv --python 3.11
uv pip install -e '.[remote,modal,ner]'
modal setup
```

`modal setup` is only needed if the machine does not already have an active
Modal profile. Model weights are cached in the `unmarker-huggingface-cache`
Modal Volume. Run artifacts are checkpointed in `unmarker-markllm-runs`.

The OpenRouter stage reads `OPENROUTER_API_KEY`. It can be set in the shell or
loaded from a named env file with `--env-file`; the value is never written to
an artifact or printed. Do not commit that env file.

## Gate 2b pilot: exact execution order

Gate 2b uses only official EXP. It has 100 clean calibration and 50 evaluation
prompts per language; the attack stage assigns exactly 20 evaluation prompts
to development and 30 to held-out testing. With four pipelines, three budgets,
the three-attempt adaptive oracle, re-stamp control, and BIRA calibration, its
theoretical minimum is 1,720 OpenRouter rewrite calls. This is a pilot, not the
formal 1,000/50/100 design.

### 1. Generate and score on Modal

```bash
uv run --extra modal modal run modal_pipeline.py \
  --stage prepare \
  --run-id gate2b-exp-pilot-v1 \
  --prompts datasets/markllm-wikipedia-v1.jsonl \
  --algorithms EXP \
  --calibration-prompts-per-language 100 \
  --evaluation-prompts-per-language 50 \
  --evidence-profile gate2b_exp_pilot \
  --output results/gate2b-exp-pilot-v1/modal-prepare
```

### 2. Build and calibrate the NER gold set

The reproducible route downloads 50 rows per language from two published,
human-annotated test sets, verifies their pinned SHA-256 hashes, then runs the
pinned GLiNER model over exactly the common PER/ORG/LOC label set:

```bash
uv run --extra modal modal run modal_pipeline.py \
  --stage ner-public-gold \
  --run-id gate2b-exp-pilot-v1 \
  --gold-samples-per-language 50 \
  --output results/gate2b-exp-pilot-v1/ner-gold

uv run --extra modal modal run modal_pipeline.py \
  --stage ner-calibrate \
  --run-id gate2b-exp-pilot-v1 \
  --gold-set results/gate2b-exp-pilot-v1/ner-gold/ner-gold.approved.jsonl \
  --output results/gate2b-exp-pilot-v1/ner-calibration
```

UNER English-EWT is CC BY-SA 4.0. KIND's manually annotated Wikinews NER
annotations are CC BY-NC 4.0, so this combined gold artifact and Gate 2b pilot
are research-only and must not be reused in a commercial backend. The generated
source, manifest, and calibrated rows remain untracked.

For a later in-domain calibration, replace the public sources with a private,
independently reviewed source. Prepare an untracked JSONL with exactly 50
independent rows per language:

```json
{"id":"private-en-001","language":"en","text":"..."}
{"id":"private-it-001","language":"it","text":"..."}
```

The text is uploaded to the configured Modal workspace and stored in its run
Volume, so apply the project's privacy policy before using sensitive data.

```bash
uv run --extra modal modal run modal_pipeline.py \
  --stage ner-draft \
  --run-id gate2b-exp-pilot-v1 \
  --gold-source /absolute/private/ner-source.jsonl \
  --gold-samples-per-language 50 \
  --output results/gate2b-exp-pilot-v1/ner-gold
```

Review every row in `ner-gold.pending.jsonl`: correct `human_entities`, set
`review_status` to `approved`, and fill `reviewer`. Calibration rejects pending
or anonymous rows. Keep the approved file private and untracked.

Then run `ner-calibrate` on the reviewed private file as above. Do not use the
published dataset reviewer fields to bless new or edited texts.

The English and Italian thresholds maximize exact-span F1, breaking ties by
recall and then the lower threshold.

### 3. Build source protection manifests on Modal

```bash
uv run --extra modal modal run modal_pipeline.py \
  --stage protect \
  --run-id gate2b-exp-pilot-v1 \
  --evidence-profile gate2b_exp_pilot \
  --gliner-thresholds results/gate2b-exp-pilot-v1/ner-calibration/gliner-thresholds.json \
  --output results/gate2b-exp-pilot-v1/protection
```

### 4. Estimate and run the OpenRouter attack grid

```bash
uv run unmarker-remote-bench estimate \
  --generations results/gate2b-exp-pilot-v1/modal-prepare/generations.jsonl

uv run unmarker-remote-bench attack \
  --profile gate2b-exp-pilot \
  --generations results/gate2b-exp-pilot-v1/modal-prepare/generations.jsonl \
  --scores results/gate2b-exp-pilot-v1/modal-prepare/token-scores.jsonl \
  --protected-spans results/gate2b-exp-pilot-v1/protection/protected-spans.jsonl \
  --output results/gate2b-exp-pilot-v1/attacks \
  --env-file /absolute/path/to/private.env
```

The profile fixes EXP, the 20/30 split, `gliner-v1`, and four concurrent
OpenRouter workers. Calls are checkpointed and de-duplicated across workers.

### 5. Detect and validate on Modal

```bash
uv run --extra modal modal run modal_pipeline.py \
  --stage evaluate \
  --run-id gate2b-exp-pilot-v1 \
  --candidates results/gate2b-exp-pilot-v1/attacks/evaluation-inputs.jsonl \
  --evidence-profile gate2b_exp_pilot \
  --quality-profile gliner-v1 \
  --evaluation-label gate2b-gliner-v1 \
  --output results/gate2b-exp-pilot-v1/modal-evaluation
```

### 6. Finalize, judge, and prepare the manual audit

```bash
uv run unmarker-remote-bench finalize \
  --candidates results/gate2b-exp-pilot-v1/attacks/candidates.jsonl \
  --baselines results/gate2b-exp-pilot-v1/attacks/baselines.jsonl \
  --evaluations results/gate2b-exp-pilot-v1/modal-evaluation/candidate-evaluations.jsonl \
  --api-calls results/gate2b-exp-pilot-v1/attacks/api-calls.jsonl \
  --output results/gate2b-exp-pilot-v1/report

uv run unmarker-remote-bench judge \
  --selections results/gate2b-exp-pilot-v1/report/progressive-selections.jsonl \
  --output results/gate2b-exp-pilot-v1/judge \
  --env-file /absolute/path/to/private.env

uv run unmarker-remote-bench finalize \
  --candidates results/gate2b-exp-pilot-v1/attacks/candidates.jsonl \
  --baselines results/gate2b-exp-pilot-v1/attacks/baselines.jsonl \
  --evaluations results/gate2b-exp-pilot-v1/modal-evaluation/candidate-evaluations.jsonl \
  --api-calls results/gate2b-exp-pilot-v1/attacks/api-calls.jsonl \
  --judge-evaluations results/gate2b-exp-pilot-v1/judge/llm-judge.jsonl \
  --output results/gate2b-exp-pilot-v1/report
```

The judge sees only language, source, and candidate. Its assessment is a
quality pre-screen, never an evasion oracle. It writes a 48-row blinded manual
audit: 24 stratified candidates plus up to 24 deterministic/judge
disagreements, with deterministic fill if necessary. When there are at most 48
progressive rows, every row is included. Complete `manual-audit.csv`; the judge
does not replace human evaluation.

Only after Gate 2b shows a useful signal should the formal profile expand to
1,000 clean calibration, 50 development, and 100 held-out prompts per language
and add the remaining watermark schemes and model families.

## General and integration commands

### 1. Generate and score on Modal

```bash
.venv/bin/modal run modal_pipeline.py \
  --stage prepare \
  --run-id markllm-qwen3-exp-v2 \
  --output results/modal-markllm-qwen3-exp-v2
```

This runs Qwen3-14B with the official MarkLLM algorithms, including native EXP
generation, calibrates the detectors, then uses Qwen3-8B to calculate token
self-information. Generated continuations exclude their prompts before
detection. Thinking is disabled.

Inspect `corpus-summary.json` before spending on rewrites. Every
algorithm/language cell should have adequate length, plausible held-out FPR,
and strong pre-attack TPR. Manually inspect both languages as well.

For an integration-only EXP smoke with the small fixture, use a fresh run ID:

```bash
.venv/bin/modal run modal_pipeline.py \
  --stage prepare \
  --run-id exp-integration-smoke-v2 \
  --prompts datasets/markllm-smoke-prompts.jsonl \
  --algorithms EXP \
  --allow-small-smoke \
  --output results/exp-integration-smoke-v2
```

This verifies the native official path but has no statistical value.

To exercise the complete held-out pipeline without generating all 400 prompts,
select four prompts from every language/split cell of the full dataset:

```bash
.venv/bin/modal run modal_pipeline.py \
  --stage prepare \
  --run-id exp-e2e-pilot-v2 \
  --prompts datasets/markllm-wikipedia-v1.jsonl \
  --prompts-per-cell 4 \
  --algorithms EXP \
  --allow-small-smoke \
  --output results/exp-e2e-pilot-v2/modal-prepare
```

This yields four calibration and four evaluation prompts per language, enough
to test development/held-out artifact flow but not enough for evidence claims.

### 2. Estimate OpenRouter calls

```bash
.venv/bin/unmarker-remote-bench estimate \
  --generations results/modal-markllm-qwen3-exp-v2/generations.jsonl
```

With 200 evaluation prompts and four watermark schemes, the complete grid has
800 watermark cases. Its theoretical minimum is 13,020 OpenRouter requests:
10,400 for the candidate grid, 2,400 for the three-attempt oracle pool, 200
shared clean re-stamp calls, and 20 clean beta-calibration calls. Adaptive BIRA
retries can increase this. Always run the estimator and a bounded pilot first.

### 3. Run a bounded OpenRouter pilot

```bash
.venv/bin/unmarker-remote-bench attack \
  --generations results/modal-markllm-qwen3-exp-v2/generations.jsonl \
  --scores results/modal-markllm-qwen3-exp-v2/token-scores.jsonl \
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

The default 235B endpoint is non-thinking, so the client omits the `reasoning`
parameter. This keeps rewrite latency and cost from being dominated by hidden
reasoning while retaining a large frontier-class rewriter and exact
logit-bias/tokenizer alignment. For an explicitly selected reasoning model, an
empty `finish_reason=length` response retries at 8,192 and then 16,384 tokens;
usage, cost, latency, request IDs, retry count, and the effective cap are
aggregated in the call artifact.

The stage resumes from `api-calls.jsonl`, `beta-calibration.json`,
`raw-candidates.jsonl`, and `raw-baselines.jsonl`. It exports candidate
algorithms to `candidates.jsonl`, controls to `baselines.jsonl`, and their union
to `evaluation-inputs.jsonl`. Reusing an output directory with different inputs
or configuration is rejected.

### 4. Detect and validate on Modal

```bash
.venv/bin/modal run modal_pipeline.py \
  --stage evaluate \
  --run-id markllm-qwen3-exp-v2 \
  --candidates results/remote-pilot/attacks/evaluation-inputs.jsonl \
  --output results/remote-pilot/modal
```

This uploads candidate and control text, runs the pinned official MarkLLM
detectors, and computes multilingual embedding and NLI quality. The result is
`candidate-evaluations.jsonl`.

### 5. Finalize held-out metrics

```bash
.venv/bin/unmarker-remote-bench finalize \
  --candidates results/remote-pilot/attacks/candidates.jsonl \
  --baselines results/remote-pilot/attacks/baselines.jsonl \
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

The same report contains separate oracle and re-stamp tables. Oracle cost is
shown both for the precomputed attempt pool and for simulated adaptive stopping.
Neither control appears in the surrogate fit, progressive candidate ranking, or
human-review sheet.

Repeat step 3 without the prompt limit only after the pilot artifacts look
correct. Use a new output directory and, for a formal run, a new immutable run
ID.

## Artifacts and interpretation

The main files are:

- Modal prepare: `generations.jsonl`, `corpus-summary.json`,
  `token-scores.jsonl`, and their manifests;
- OpenRouter attacks: `api-calls.jsonl`, `beta-calibration.json`,
  `candidates.jsonl`, `baselines.jsonl`, `evaluation-inputs.jsonl`, and
  `attack-summary.json`;
- Modal evaluation: `candidate-evaluations.jsonl` and manifest;
- GLiNER: pending/approved private gold, calibrated thresholds, and
  `protected-spans.jsonl` plus manifest;
- quality pre-screen: `llm-judge.jsonl`, summary, `manual-audit.csv`, and its
  separate blind key;
- finalization: `summary.json`, `REPORT.md`,
  `progressive-selections.jsonl`, `adaptive-oracle-selections.jsonl`,
  `human-review.csv`, and the separate blind key.

The future `/capabilities` and asynchronous batch API boundary is documented in
[`BACKEND_CONTRACT.md`](BACKEND_CONTRACT.md), but no HTTP service is introduced
at this research stage.

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

On 2026-08-22, the GLiNER Modal stage loaded the pinned multilingual model and
created 24 protected-source records for the existing EXP end-to-end pilot. A
fresh source-aware evaluation completed all 128 candidate/control rows. At the
provisional, uncalibrated 0.5 threshold it produced a 50.0% complete
quality-pass rate; detector TPR was 60.94%. Diagnostics found 55
entity-preservation, 25 source-aware introduced-entity, 18 number, 15
negation, and 10 quotation failures. These values validate integration and
expose rewriter/NER failure modes; they are not algorithm evidence because the
pilot has only four evaluation prompts per language and the GLiNER threshold
was not calibrated on human gold.

The pinned `openai/gpt-5.6-terra` judge also completed all 24 progressive rows
through the OpenAI OpenRouter route. It passed 50.0%, marked 50.0% with a
material error, and disagreed with the deterministic/neural quality decision
on seven rows. Observed cost was $0.103768. The route supports strict structured
output, seed, and medium reasoning but not `temperature`; the structured client
therefore omits only that unsupported parameter and keeps provider fallbacks
disabled. These judgments remain a pre-screen pending the 24-row manual audit.
