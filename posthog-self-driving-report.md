# PostHog Self-driving Setup Report

**Project:** Unmarker.it  
**Date:** 2026-08-16  
**Inbox:** https://eu.posthog.com/project/104940/inbox

## Summary

PostHog Self-driving has been configured for Unmarker.it with error tracking, session replay, support, and health-check signal sources enabled, plus a 5-scout troop and two Replay Vision scanners watching the app's watermark-removal flow. Findings will start appearing in the [Self-driving inbox](https://eu.posthog.com/project/104940/inbox) within approximately 30 minutes.

---

## AI Data Processing

**Status:** Approved. Organisation-level AI data processing consent was granted before this run.

---

## GitHub

**Status:** Connected during this run.  
**Account:** ing-norante (integration id: 78287)  
**Created:** 2026-08-16  
Self-driving can now research findings in the ing-norante/unmarker.it repository and open fix PRs.

---

## Products Enabled

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Enabled (follow-up required)** | `products-enable` tool unavailable on this deployment. Manual step needed — see Follow-ups. The `posthog.init` has no `disable_session_recording` override, so the server flip takes effect once applied. |
| Error Tracking | **Enabled (follow-up required)** | Same tool unavailability. Client init already has `capture_exceptions: true`, so error tracking is already active in the browser SDK. 142 active issues confirmed on the server. |
| Support (Conversations) | **Enabled (follow-up required)** | Same tool unavailability. Once enabled, tickets only arrive once an inbound channel (email / inbox / Slack) is connected in PostHog — see Follow-ups. |

**Note on `posthog.init`:** The existing init in `src/lib/analytics.ts` was reviewed. No overrides that would cancel the product enables were found (`disable_session_recording` absent, `capture_exceptions: true` already set). No edits needed.

---

## Signal Sources

| Source product | Source type | Action | ID |
|---|---|---|---|
| `health_checks` | `health_issue` | **Enabled** | 01a00a9b-b863-75f6-bf48-693522429c8f |
| `error_tracking` | `issue_created` | **Enabled** | 01a00a9b-bf21-7f9b-a1e4-9b30c713411b |
| `error_tracking` | `issue_reopened` | **Enabled** | 01a00a9b-c208-7fc3-974a-71e06322585d |
| `error_tracking` | `issue_spiking` | **Enabled** | 01a00a9b-c43f-7e09-a49f-c0785a047a40 |
| `session_replay` | `session_analysis_cluster` | **Enabled** (sample rate 0.1) | 01a00a9b-c9ef-7077-91e3-db27f87abc23 |
| `conversations` | `ticket` | **Enabled** (dormant until channel connected) | 01a00a9b-cd62-716c-b6c0-bb7981833bb5 |
| `signals_scout` | `cross_source_issue` | **On by default** — no row needed; creating a row only opts out |
| `replay_vision` | *(no source row)* | **Self-authorizing** — `emits_signals` on each scanner is the per-source config; no inbox source row is created or needed |

---

## Connected Tools

No external tools were selected. All third-party issue-tracker, error-tracker, and support-desk integrations were skipped (user chose "None of these").

---

## Scout Troop

**Run budget:** 100 runs/day (early-access default), 3 runs/tick. 0 runs used today at time of setup.  
**Banner:** "Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."

### Enabled (5 scouts)

| Scout | Why enabled |
|---|---|
| `signals-scout-general` | Always on — cross-product correlations and surfaces no specialist covers |
| `signals-scout-web-analytics` | Public website tracking pageviews; per-channel session volume and landing-page health are the primary growth signal |
| `signals-scout-web-vitals` | Performance-heavy SPA doing client-side image processing (OpenCV + Gemini); Core Web Vitals regressions are high-impact |
| `signals-scout-product-analytics` | App tracks a rich set of workflow action events (`upload_image`, `process_image`, `processing_complete`, `download_processed`); watches saved funnel/retention insights for conversion regressions |
| `signals-scout-health-checks` | Fresh setup with no prior baseline; instrumentation health issues are actionable immediately |

### Disabled (22 scouts)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Covered by native error-tracking source (issue_created / issue_reopened / issue_spiking) |
| `signals-scout-session-replay` | Covered by native session_replay source (session_analysis_cluster) |
| `signals-scout-feature-flags` | No feature flags in use — enable if adopted later |
| `signals-scout-surveys` | No surveys configured — enable if adopted later |
| `signals-scout-ai-observability` | Gemini is used client-side but not through PostHog `$ai_*` events — enable if LLM observability is instrumented later |
| `signals-scout-revenue-analytics` | No payment SDK or revenue data; free/open-source tool |
| `signals-scout-experiments` | No A/B experiments active |
| `signals-scout-csp-violations` | CSP headers are configured via Vercel but `$csp_violation` event capture is not instrumented |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-customer-analytics` | B2C tool; no group/accounts analytics |
| `signals-scout-data-pipelines` | No CDP destinations or batch exports configured |
| `signals-scout-data-warehouse` | No warehouse imports |
| `signals-scout-apm` | No OpenTelemetry/distributed tracing |
| `signals-scout-conversations` | Support product newly enabled but no inbound channel yet |
| `signals-scout-anomaly-detection` | Troop already at 5; general scout covers cross-product anomalies |
| `signals-scout-observability-gaps` | Troop already at 5; can enable later once dashboards are built |
| `signals-scout-inbox-validation` | No shipped fixes to validate yet (fresh setup) |
| `signals-scout-insight-alerts` | No configured insight alerts |
| `signals-scout-replay-vision` | Replay Vision scanners created in this run — no accumulated observation history yet for trend analysis |
| `signals-scout-mcp-tool-calls` | No `$mcp_tool_call` telemetry |
| `signals-scout-skills-store` | Not applicable to this project |
| `signals-scout-tasks` | No PostHog Tasks/agent run history yet |

---

## Custom Scouts

**Result:** None created.

### Gap analysis

Two candidate surfaces were identified and proposed:

| Candidate | Filter applied | Outcome |
|---|---|---|
| Image processing funnel (upload → download completion rate) | Is it covered? `product-analytics` watches *saved* funnels — no funnel saved yet on this fresh project, so genuinely uncovered. Passed all three filters. | **Proposed, declined** |
| Workflow error rate (`action_clicked` with `action=workflow_error`) | Is it covered? Error tracking catches JS exceptions; `workflow_error` is a custom domain event. Passed all three filters. | **Proposed, declined** |

The built-in troop covers this project without custom additions. If the scouts turn out noisy, set `emit: false` on a scout's config in PostHog to switch it to dry-run without disabling it.

---

## Replay Vision Scanners

Replay Vision scanners are LLMs that watch individual session recordings on a schedule and push what they find directly to the Self-driving inbox. Findings arrive at half weight; a report is promoted once findings reach a full weight (corroboration from a second scanner, or the same finding across multiple runs). The `creating-replay-vision-scanners` sizing skill was unavailable on this deployment — credit spend was not pre-verified; at these defaults (scoped query + `sampling_rate ≤ 1`, `gemini-3.5-flash-lite` at 2 credits/observation) the spend is negligible.

No recordings exist yet — scanners are armed and will start working the day recordings begin.

### Scanner 1: Broken experiences

| Field | Value |
|---|---|
| **Status** | Created |
| **What it watches** | Any session on `unmarker.it` — the entire watermark-removal workflow (upload → process → download) happens on the same SPA root URL (`/` and `/zh-hans/`); there is no separate "checkout" path to scope narrower |
| **Query scope** | `$current_url icontains "unmarker.it"` |
| **Sampling rate** | 0.5 (50% of matching sessions) |
| **Model** | `gemini-3.5-flash-lite` (2 credits/observation) |
| **Estimated monthly credits** | 0 (no recordings yet) |
| **ID** | 01a00abd-3d16-70ce-9761-a02185cf059c |

### Scanner 2: User frustration

| Field | Value |
|---|---|
| **Status** | Created |
| **What it watches** | Sessions containing a `$rageclick` event — high-precision gate for frustration; left URL-unscoped to stay disjoint from scanner 1 |
| **Query scope** | Sessions with `$rageclick` event |
| **Sampling rate** | 1.0 (100% of rage-click sessions) |
| **Model** | `gemini-3.5-flash-lite` (2 credits/observation) |
| **Estimated monthly credits** | 0 (no recordings yet) |
| **ID** | 01a00abd-5a89-734d-8f29-22284dc3d8c5 |

---

## Follow-ups

- [ ] **Enable Session Replay manually:** Settings → Session replay → turn on "Record user sessions". The `products-enable` MCP tool was unavailable during setup.
- [ ] **Confirm Error Tracking is on:** Settings → Error tracking → "Enable exception autocapture". Already active in the client SDK (`capture_exceptions: true`), but server-side product toggle needs manual confirmation.
- [ ] **Enable Support (Conversations):** Enable from the PostHog product sidebar, then **connect an inbound channel** (email, inbox, or Slack) so the `conversations/ticket` source starts receiving tickets.
- [ ] **Save a funnel in PostHog** covering the core workflow (`upload_image` → `processing_complete` → `download_processed`) so the `signals-scout-product-analytics` scout has a saved flow to watch.
- [ ] **Consider enabling `signals-scout-csp-violations`** if you instrument `$csp_violation` event capture — CSP reporting headers are already set in `vercel.json`.
- [ ] **Consider adding custom scouts** for the image processing funnel and workflow error rate if you want dedicated monitoring beyond the built-in troop (both proposals passed the gap analysis; they were declined during setup and can be added later via PostHog's skills store).

---

## What Happens Next

The scout coordinator picks up the new configs within ~30 minutes and dispatches the first runs. Each scout run draws one credit from the project's daily budget (100 runs/day during early access). Findings cluster into reports in the [inbox](https://eu.posthog.com/project/104940/inbox); immediately actionable ones can spawn coding tasks automatically. Replay Vision findings arrive as sessions are recorded — the scanners are already armed.
