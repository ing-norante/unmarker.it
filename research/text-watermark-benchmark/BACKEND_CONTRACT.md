# Deferred backend contract

The current system now has a resumable product-oriented batch implementation in
`adaptive_cli.py`, but it is not yet a public rewriting service. The HTTP layer
remains deferred until the adaptive policy has been measured on an independent
holdout and retention, authentication, billing, and abuse controls are fixed.

When that gate is reached, the smallest useful contract is:

```http
GET /capabilities
```

```json
{
  "schema_version": 1,
  "languages": ["en", "it"],
  "modes": ["unicode_hygiene", "adaptive_rewrite"],
  "max_input_tokens": 4096,
  "quality_gates": ["gliner_protected_spans", "structured_exactness", "semantic_similarity", "bidirectional_nli", "llm_prescreen"],
  "rewrite_stages": ["conservative", "contextual_chunk", "backtranslation", "structural", "position_aware_bira"],
  "generic_detector_ensemble": ["binoculars", "fast_detect_gpt", "logrank", "radar"],
  "watermark_research_scope": ["KGW", "Unigram", "SynthID", "EXP"],
  "production_detector_claim": false
}
```

Batch work should be asynchronous and idempotent:

```http
POST /v1/rewrite-jobs
Idempotency-Key: <client-generated key>

GET /v1/rewrite-jobs/{job_id}
```

Each submitted item should have its own stable `item_id`; results should expose
the rewritten text, Unicode audit, deterministic and neural quality checks,
cost, latency, and a versioned model/config manifest. Partial item failures must
not fail the entire batch. The service must never expose research detector
scores as proof about an undisclosed production watermark.

Before exposing the HTTP contract, decide from adaptive holdout evidence:

1. the promoted rewrite-family routes and progressive stopping policy;
2. fixed quality thresholds and maximum retries;
3. provider/model pinning and fallback behavior;
4. retention, privacy, abuse-prevention, and billing requirements;
5. whether detector feedback is legally and operationally available in production.
