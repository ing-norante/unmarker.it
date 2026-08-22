# Deferred backend contract

The current system is a batch research benchmark, not a production rewriting
service. The HTTP layer is intentionally deferred until the benchmark selects
an algorithm and fixes its validator thresholds. Adding it now would freeze an
interface around experimental behavior.

When that gate is reached, the smallest useful contract is:

```http
GET /capabilities
```

```json
{
  "schema_version": 1,
  "languages": ["en", "it"],
  "modes": ["unicode_hygiene", "rewrite"],
  "max_input_tokens": 4096,
  "quality_gates": ["protected_spans", "semantic_similarity", "bidirectional_nli"],
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

Before implementation, decide from benchmark evidence:

1. the promoted rewrite algorithm and progressive budget policy;
2. fixed quality thresholds and maximum retries;
3. provider/model pinning and fallback behavior;
4. retention, privacy, abuse-prevention, and billing requirements;
5. whether detector feedback is legally and operationally available in production.
