# Human audit review desk

A local-only Vite interface for completing the blinded human quality audit. It
accepts both benchmark artifacts:

- `judge/manual-audit.csv`, whose source column is `source_text`;
- `report/human-review.csv`, whose source column is `original_text`.

The app validates the audit contract before showing any row. All ratings are
autosaved in browser `localStorage`, keyed by a fingerprint of the imported
CSV. Nothing is uploaded. Export writes a new `*.reviewed.csv` file and
preserves multiline text, unknown columns, column order, quotes, and commas.

## Run the app

From the repository root:

```bash
pnpm audit:dev
```

Open the URL printed by Vite, then drag in the blinded CSV. For the current
Gate 2b pilot, select:

```text
research/text-watermark-benchmark/results/gate2b-exp-pilot-20260822-01/judge/manual-audit.csv
```

For the independent reliability pass, open the generated file instead:

```text
research/text-watermark-benchmark/results/gate2b-exp-pilot-20260822-01/human-audit/second-review.csv
```

That 12-row sheet is newly blinded and must be completed by a reviewer who has
not seen the primary ratings or the private key.

Importing the same original file later restores its local session. Use
**Esporta CSV** at any time for a recoverable checkpoint; the app labels an
incomplete export as a draft without blocking it.

## Review contract

A record is complete only after all three required judgments are set:

1. meaning preservation, from 1 (altered) to 5 (equivalent);
2. fluency, from 1 (unreadable) to 5 (natural);
3. factual or polarity error, explicitly `true` or `false`.

Notes are optional. `true` means that the candidate adds or changes a fact,
reverses a negation, or materially contradicts the source. The app never loads
the separate blind key, candidate strategy, detector result, or model name.

Keyboard shortcuts are disabled while typing notes:

| Shortcut           | Action                            |
| ------------------ | --------------------------------- |
| `1`–`5`            | Meaning-preservation rating       |
| `Option` + `1`–`5` | Fluency rating                    |
| `C`                | Mark content as correct           |
| `E`                | Mark factual/polarity error       |
| `←` / `→`          | Previous / next visible row       |
| `Cmd` + `Enter`    | Continue when the row is complete |

On Windows or Linux, use `Alt` instead of `Option` and `Ctrl` instead of
`Cmd`.

## Verification

```bash
pnpm audit:test
pnpm audit:build
```

These commands do not start a development server. The production build is
written to `research/text-watermark-benchmark/audit-app/dist/` and is ignored
by Git.
