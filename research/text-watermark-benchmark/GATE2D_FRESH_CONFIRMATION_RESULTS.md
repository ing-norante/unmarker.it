# Gate 2d: fully fresh adaptive confirmation

## Decision

The adaptive Grok cascade works, but it is not reliable enough to market as a
watermark remover. On the fully fresh bilingual confirmation it achieved 7/40
quality-preserving full-ensemble successes: 17.5%, with a 95% Wilson interval
of 8.7–31.9%.

This is sufficient to productize a paid, asynchronous **verified best-effort
attempt**. It is not sufficient to promise watermark removal or an AI-detector
pass. The product must distinguish a verified pass from risk reduction and an
unsuccessful best effort.

## Independent corpus

The confirmation topics came from the pinned
`wikimedia/wikipedia@b04c8d1ceb2f5cd4588862100d08de323dccfbaa` snapshot.
The selector excluded all 400 previously used article IDs and returned 300 new,
unique topics:

- 100 calibration and 50 evaluation prompts per language;
- zero overlap with every supplied historical artifact;
- prompt SHA-256
  `0873815b7387bb43c14d8cebe750af1390e026b501ce006c2a3b42a1b285d8a8`.

Official EXP generation used MarkLLM commit
`c45ddc40f7b761beabe55a1b8dc4690e531d1c6d`, Qwen3-14B revision
`40c069824f4251a91eefaf281ebe4c544efd3e18`, and EXP configuration hash
`3840c5b61a076bd7363ed5ff3f4bf08115690a521ef246b2d19e5b62f853b84f`.
All generated texts passed the length requirement.

The new calibration produced thresholds 1.634 (EN) and 1.882 (IT). On the 50
fresh evaluation rows per language, watermarked TPR was 100% EN and 94% IT;
the observed unwatermarked FPR was 2% in both cells, one false positive out of
50. The 40-row adaptive slice was frozen by seeded ordering from the detected
population before rewriting: 20/50 EN and 20/47 IT.

## Frozen method

The route was selected only from the prior English development sweep:
`x-ai/grok-4.6`, xAI provider, low reasoning, 2,048 output tokens with an 8,192
length retry ceiling. The route, prompts, thresholds, and validators were not
changed after opening the confirmation outcomes.

Every candidate was evaluated together against:

- exact GLiNER/entity, number, URL, quotation, date, negation, and terminology
  preservation;
- multilingual semantic similarity and bidirectional NLI;
- blinded Terra material-error, fluency, and naturalness judgment;
- compatible official EXP;
- Binoculars, Fast-DetectGPT, LogRank, and RADAR with their fixed bilingual
  calibrations.

A success required quality plus every available detector to be clear. This is
stricter than choosing the best score from an ensemble.

## Results

| Population | Full gate | Quality pass | Protected pass | Material errors | Mean token change | Total API cost |
|---|---:|---:|---:|---:|---:|---:|
| English | 3/20 (15.0%) | 16/20 | 16/20 | 0/20 | 27.7% | $2.3215 |
| Italian | 4/20 (20.0%) | 16/20 | 17/20 | 1/20 | 31.9% | $2.1793 |
| Combined | 7/40 (17.5%) | 32/40 | 33/40 | 1/40 | 29.8% | $4.5009 |

The combined median token change was 24.7%. Median recorded OpenRouter latency
was 260.8 seconds per document; detector cold-start and queue time are not
included in that field. Mean OpenRouter cost was $0.1125 per document.

Five accepted candidates came from contextual chunking and two from
backtranslation. No conservative or structural selected candidate passed the
full ensemble. Accepted edit ratios ranged from 33.2% to 43.1%; their semantic
similarities ranged from 0.960 to 0.989 and bidirectional NLI from 0.985 to
0.997.

The only selected material error changed temporal information and degraded an
Italian passage. The judge and deterministic/semantic gates rejected it; it is
not among the seven successes.

## Detector behavior

The table reports the initially positive population for each detector,
conditional evasion within that population, and mean signed calibrated-margin
change. Negative margin change is improvement.

| Detector | Initially positive | Conditional evasion | Selected clear | Mean margin change |
|---|---:|---:|---:|---:|
| Compatible EXP | 40/40 | 26/40 (65.0%) | 26/40 | -2.379 |
| Binoculars | 39/40 | 18/39 (46.2%) | 19/40 | -0.153 |
| Fast-DetectGPT | 34/40 | 24/34 (70.6%) | 30/40 | -0.737 |
| LogRank | 3/40 | 2/3 (66.7%) | 39/40 | -0.405 |
| RADAR | 37/40 | 21/37 (56.8%) | 24/40 | -0.632 |

The cascade consistently reduced detector margins; 20/40 selected candidates
passed quality and compatible EXP. Only seven also cleared every generic
detector. Among quality-passing failures, three were blocked by Binoculars
alone and two by RADAR alone. This is why single-detector development success
did not transfer directly to full-ensemble success.

## Product implication

The evidence supports this contract:

1. accept the text as an asynchronous backend job;
2. protect facts and entities before generation;
3. use the frozen Grok cascade with conservative early stopping, then
   contextual chunking and backtranslation;
4. evaluate every candidate against quality, the compatible target when known,
   and the generic ensemble;
5. return `verified` only for the full gate, `risk_reduced` for a quality-safe
   candidate with materially lower ensemble margins, and `best_effort` when no
   safe improvement exists;
6. expose which checks passed, edit amount, and an explicit statement that
   detector outcomes are not guaranteed on third-party services.

At the observed confirmation rate, charging only for `verified` results or
including retries in a credit-based job is more defensible than charging for a
promised removal. The image-removal feature can remain client-side and separate.

Before public launch, the seven accepted outputs should receive a small blinded
human spot-check, and the asynchronous API should enforce cost/time ceilings.
Neither step changes this benchmark result.
