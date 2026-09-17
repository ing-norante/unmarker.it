CREATE TABLE IF NOT EXISTS sponsor_buyers (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  stripe_customer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '120 days'
);

CREATE TABLE IF NOT EXISTS sponsor_purchases (
  id uuid PRIMARY KEY,
  buyer_id uuid NOT NULL REFERENCES sponsor_buyers(id),
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  description text NOT NULL,
  icon bytea NOT NULL,
  status text NOT NULL CHECK (status IN ('creating','pending','active','expired','cancelled','refunded','disputed','attention')),
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  checkout_url text,
  checkout_expires_at timestamptz NOT NULL,
  starts_at timestamptz,
  expires_at timestamptz,
  paid_event_id text,
  analytics_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  UNIQUE (buyer_id, request_id),
  CHECK ((starts_at IS NULL) = (expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS sponsor_purchase_status_idx ON sponsor_purchases(status, expires_at);
CREATE TABLE IF NOT EXISTS sponsor_webhook_receipts (
  id text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sponsor_rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS sponsor_analytics_outbox (
  id uuid PRIMARY KEY,
  purchase_id uuid NOT NULL REFERENCES sponsor_purchases(id),
  event text NOT NULL,
  delivered_at timestamptz,
  UNIQUE (purchase_id, event)
);

-- Existing purchases have no recorded consent: they are ineligible for analytics.
ALTER TABLE sponsor_buyers ADD COLUMN IF NOT EXISTS analytics_consent jsonb;
ALTER TABLE sponsor_purchases ADD COLUMN IF NOT EXISTS analytics_consent_at bigint;

-- Purchase-scoped snapshots, never exposed by the catalog or analytics.
ALTER TABLE sponsor_purchases ADD COLUMN IF NOT EXISTS billing_details jsonb;
ALTER TABLE sponsor_purchases ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE sponsor_purchases ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE sponsor_purchases ADD COLUMN IF NOT EXISTS billing_snapshot jsonb;
ALTER TABLE sponsor_purchases ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- Publication is independent of Stripe's payment state: reconciliation must never
-- undo an administrator's action on a customer's voluntary cancellation request.
ALTER TABLE sponsor_purchases ADD COLUMN IF NOT EXISTS publication_stopped_at timestamptz;
ALTER TABLE sponsor_purchases ADD COLUMN IF NOT EXISTS publication_stopped_by text;
ALTER TABLE sponsor_purchases ADD COLUMN IF NOT EXISTS publication_stop_reference text;
