# Anthropic marks: official holdout integration

Last verified against Anthropic's public documentation on 2026-09-02.

## What Anthropic released

Anthropic documents two different marking systems that must not be conflated:

| Mark | Carrier | Public verification |
| --- | --- | --- |
| Embedded text watermark | Statistical signal woven into generated text | No. Detection is in private preview for eligible organizations. |
| C2PA Content Credential | Signed metadata attached to supported files | Yes. The browser-only Claude Content Checker reads it locally. |

The public [Claude Content Checker](https://claude.com/check-content) accepts
JPG, PNG, GIF, WEBP, TIFF, HEIC, AVIF, SVG, DNG, JXL, MP4, MOV, AVI, WAV, MP3,
M4A, and FLAC files up to 100 MB. It does not accept pasted text or text files.
Anthropic states that the checker runs in the browser, reads the embedded
credential rather than the file content, and does not upload or retain the
file.

The official support article says that supported Claude models embed a mark at
generation time and that it can persist through some editing. As of the same
article revision, text-watermark detection is still a private preview. Public
access is limited to eligible regulators, law enforcement, media,
fact-checkers, independent researchers, educational and civil-society groups,
and enterprises with related EU compliance obligations. Anthropic plans a
detection API but has not published its request or response contract.

Current supported-model names in the article are Fable 5.1 and Mythos 5.1.
Older Claude models cannot be assumed to carry the mark. A missing mark also
does not establish human authorship: Anthropic explicitly lists older models,
heavy editing, short passages, mixed text, and unsupported platforms as causes
of non-detection.

Official sources:

- [How Claude marks AI-generated content](https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content)
- [Claude Content Checker](https://claude.com/check-content)
- [Watermark detector access request](https://forms.gle/9tGA33hPJJwtHsMk9)

## Benchmark decision

The public checker cannot be added to the text detector ensemble. It verifies
C2PA file metadata, not the embedded statistical text watermark. Automating it
against `.txt` files would produce no text-watermark evidence.

The official Anthropic text detector is instead represented as a strictly
post-hoc external holdout. Its outcomes are never visible to candidate
generation, Pareto selection, or cascade stopping. This prevents the official
detector from becoming an adaptive attack oracle and preserves the existing
MarkLLM and open-detector results unchanged.

## Export a frozen private-preview batch

First generate a new corpus with a Claude model that Anthropic explicitly
documents as marked. Record the exact model, product surface, date, and raw
response before running the cascade. The source request must use
`generator_family: "anthropic"`, which excludes Anthropic rewrite routes.

After the adaptive run, freeze source/selected pairs:

```bash
uv run unmarker-anthropic-mark-eval export \
  --adaptive-results results/<run>/en/results.jsonl \
  --adaptive-results results/<run>/it/results.jsonl \
  --output results/<run>/anthropic-official-holdout \
  --source-provenance supported_claude_marked \
  --expected-generator-family anthropic \
  --source-model <exact-supported-model-id> \
  --source-surface <claude-product-or-api-surface>
```

The command writes:

- `batch.jsonl`, containing source and selected texts with stable IDs and
  SHA-256 hashes;
- `manifest.json`, pinning every adaptive input and declaring the private
  preview and post-hoc contracts;
- `detector-results.template.jsonl`, the normalized response template.

Do not label an OpenRouter model as supported merely because its name contains
`claude`. The generation route must be one that Anthropic says receives marks,
and that fact must be captured in the run manifest.

## Normalize official results

An approved private-preview client should map each official response to one
row without changing the item ID or text hash:

```json
{
  "item_id": "document-001|source",
  "text_sha256": "...",
  "status": "success",
  "mark_detected": true,
  "detector_version": "provider-supplied version",
  "raw_result": {}
}
```

No HTTP endpoint is guessed in this repository. Once Anthropic publishes or
grants an API contract, its thin transport adapter should emit exactly this
normalized schema. Provider errors use `status: "error"` and
`mark_detected: null`.

Produce the paired report only after the complete batch returns:

```bash
uv run unmarker-anthropic-mark-eval report \
  --batch results/<run>/anthropic-official-holdout/batch.jsonl \
  --results results/<run>/anthropic-official-holdout/detector-results.jsonl \
  --output results/<run>/anthropic-official-report
```

The reporter validates item IDs and hashes and calculates, separately by
language and combined:

- source and selected detection rates;
- conditional evasion among marked sources;
- quality-preserving conditional evasion;
- accidental mark introduction on initially clear sources;
- coverage and claim admissibility.

`claim_admissible` is false unless every result succeeds, the manifest says
the sources came from a supported marked Claude route, and at least one source
is detected. `--allow-incomplete` is diagnostic only and can never make an
incomplete report admissible.

## What remains blocked

There is no official text-watermark result in the benchmark yet. We need both:

1. access to Anthropic's private-preview text detector;
2. a fresh paired corpus generated by a currently supported marked Claude
   model.

Until then, EXP remains the compatible executable research watermark and the
official Anthropic integration remains a validated data boundary, not a
detector implementation or an evasion result.
