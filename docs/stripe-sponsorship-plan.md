# Stripe sponsorship: implementation and operations

Implemented in the `codex/sponsor-checkout` worktree, 16 September 2026.
The complete purchase flow has been exercised with a real Stripe **test** Checkout
and local PostgreSQL. No live payments or production deployment were made.

## Product contract

- **One payment of €500 for 30 days. No subscription or automatic renewal.**
- The advertiser supplies a project name, website URL, short description and icon
  before leaving for Stripe Checkout. A confirmed payment publishes the supplied
  creative automatically; there is no approval queue.
- The interval starts at Stripe's `payment_intent.succeeded` event timestamp and
  lasts exactly **720 hours**, including daylight-saving changes. Creating a
  Checkout, returning to the site or replaying a webhook never starts or extends it.
- All positions have the same price. Paired desktop cards have equal 10-second
  phases in a 20-second cycle. Actual impressions depend on visibility, visit
  duration, screen size and pauses; equal impression counts are not promised.
- There are 20 places including the four house projects: initially 16 available
  paid places. Pending Checkouts reserve capacity for up to 40 minutes. Capacity
  is released only after Stripe confirms expiry/cancellation or absence of a
  remotely created Checkout. An uncertain response does not free the place.
- A new purchase after expiry is a new explicit payment. Multiple paid campaigns
  per buyer are supported, with one unfinished Checkout at a time.
- Any refund removes the placement. A dispute pauses it, retaining its slot until
  the original end date so winning the dispute can safely restore it. Neither a
  refund nor a dispute changes the original start date.
- The implemented Checkout charges a fixed total of €500 in EUR, with adaptive
  pricing and automatic tax disabled. It currently accepts cards. Any different
  tax treatment, additional payment methods or commercial policies must be
  configured deliberately before launching live sales.

## Architecture

The [t3dotgg recommendations](https://github.com/t3dotgg/stripe-recommendations)
contribute two central rules: persist the Stripe Customer before creating Checkout,
and use one server synchronization function to retrieve canonical Stripe state.
The subscription-specific assumptions are replaced with individual one-time
purchases. Webhooks, the return page and reconciliation all call the same sync.

### Frontend

- `SponsorBookingForm` uses TanStack Form, shared Zod validation and shadcn
  `Field`, `Input`, `Textarea`, alerts and cards. It includes a local preview,
  validation feedback, pending-payment recovery and cancellation.
- Hosted Stripe Checkout collects billing and card details. Neither the private
  nor publishable Stripe key is needed by the client. The public key supplied
  in `.env` is retained for potential future integrations.
- The return dialog verifies the purchase on the server and displays its dates.
  It never trusts a success query parameter as proof of payment.
- `useSponsorCatalog` combines the four bundled house ads with paid campaigns
  from the API, refreshing every 15 seconds and when the tab becomes visible.
  An additional local timer removes expired campaigns from already-open pages.
  During an outage, existing cards remain only until their known expiry and
  checkout becomes unavailable when the server reports unavailability.
- The sponsor icon is the only image uploaded by this feature. PNG/JPEG/WebP
  uploads are limited to 256 KB and one megapixel, decoded and re-encoded on the
  server to a 128×128 WebP. SVG and arbitrary remote icon fetching are excluded.
  The watermark-processing workflow continues entirely in the browser.

### Server and PostgreSQL

`api/sponsors.ts` is the Vercel Node function. `scripts/sponsors-api.ts` provides
the same Fetch handler locally on port 5174, proxied by Vite on port 5173.

| Action on `/api/sponsors` | Method | Purpose                                                                          |
| ------------------------- | ------ | -------------------------------------------------------------------------------- |
| default / `catalog`       | GET    | Active public campaigns and availability                                         |
| `icon&id=…`               | GET    | Normalized icon for an active campaign                                           |
| `session`                 | POST   | Establish an anonymous buyer session                                             |
| `checkout`                | POST   | Validate multipart creative, reserve capacity and create/reuse Checkout          |
| `purchases`               | POST   | Recent purchases owned by this session                                           |
| `status`                  | POST   | Verify ownership and synchronize one purchase from Stripe                        |
| `cancel`                  | POST   | Expire an unfinished Checkout in Stripe before releasing capacity                |
| `webhook`                 | POST   | Verify the raw-body Stripe signature and fulfill durably                         |
| `reconcile`               | GET    | Recover interrupted/missed updates; requires `Authorization: Bearer CRON_SECRET` |

The schema in `server/sponsors/schema.sql` stores buyers, creatives/icons,
purchases, webhook receipts, rate limits and an analytics outbox. Transactions
and a shared PostgreSQL advisory lock serialize inventory changes across server
instances. Unique constraints protect request IDs, Session/PaymentIntent IDs and
webhook IDs. A retry with the same request ID reuses the purchase; changing its
creative is rejected. A remotely created Session is recovered before attempting
another creation after a network/database interruption.

The guest session is an opaque random cookie, `HttpOnly`, `SameSite=Lax`, `Secure`
on HTTPS, scoped to the sponsor API and valid for 120 days. Only its hash is stored
in PostgreSQL. Mutating browser requests must pass the trusted Origin and custom
header checks. Ownership is checked before returning or cancelling a purchase.
There is no login or email-based recovery: purchase management is limited to the
original browser session. Lost-session support can be handled with the Stripe
receipt and server purchase reference; cross-device self-service is future work.

Fulfillment retrieves the current Session, PaymentIntent, charge and any dispute,
checking customer, purchase reference, Price, amount, currency, mode and environment.
A valid webhook is acknowledged only after database work commits. Failures remain
retryable, and duplicate/out-of-order events cannot extend the campaign. This
follows Stripe's [webhook](https://docs.stripe.com/webhooks) and
[Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment) guidance.

## Run locally

Prerequisites: Node.js, pnpm and Docker Desktop. `.env` is ignored by Git.
Use `.env.example` as the variable reference; do not overwrite existing keys.

```sh
pnpm install
pnpm sponsors:db:up
pnpm sponsors:db:migrate
pnpm sponsors:stripe:setup
```

The database is isolated in Docker project `unmarker-sponsors-5486`, exposed only
on `127.0.0.1:55486`. It does not modify the existing local databases. The migration
is repeatable. The setup command accepts only test keys for the configured Stripe
account and reuses the matching product/price.

In three terminals, in this order:

```sh
# 1. Keep running; saves the local signing secret to .env without printing it.
pnpm sponsors:stripe:listen

# 2. Start after the listener reports ready; restart after changing server code or .env.
pnpm sponsors:api

# 3. The application must use this origin, matching SPONSOR_APP_URL.
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://localhost:5173`, choose **Advertise**, enter the creative, upload an
icon and continue to Stripe. The modal and Stripe page explicitly identify test
mode. Use Stripe's [documented test cards](https://docs.stripe.com/testing), for
example `4242 4242 4242 4242`, a future expiry and any valid CVC. No money moves.

Run reconciliation manually when needed:

```sh
pnpm sponsors:reconcile
```

Stop the database without deleting its persisted volume:

```sh
docker compose -p unmarker-sponsors-5486 -f compose.sponsors.yml stop
```

### Test account objects

- Account: `acct_1SmYbmERgtKRH2sI`
- Product: `prod_VGm40oGPn8sGNl`
- One-time Price: `price_1UGEWDERgtKRH2sIITxes0cM` (€500, test mode)

These are identifiers, not credentials. Local keys, signing/session/cron secrets
and the PostgreSQL connection string remain in `.env` only.

## Verification

```sh
pnpm test
pnpm sponsors:test
pnpm lint
pnpm build
```

`pnpm sponsors:test` requires a localhost PostgreSQL URL and creates/drops its own
random schema. It uses real PostgreSQL transactions and mocked Stripe responses;
it does not modify the local purchase records or send analytics/payments.
The normal test suite skips these integration tests when no dedicated test URL is
provided.

Coverage includes concurrent capacity reservations, duplicate requests and changed
creative, remote Checkout recovery, unpaid return visits, signed webhooks without
browser return, invalid signatures and database/network retry, unauthorized access,
amount verification, cancellation, out-of-order refund events, dispute restoration,
canonical payment dates and daylight-saving/expiration behavior.

The browser test completed a real Stripe test purchase and returned to an active
campaign. Both `payment_intent.succeeded` and `checkout.session.completed` were
received with HTTP 200. The stored interval was 16 September 2026 09:05:21 UTC to
16 October 2026 09:05:21 UTC. A subsequent test refund succeeded; the
`charge.refunded` webhook removed the campaign and restored the initial 16 free
places. Desktop 1440×900 and mobile 390×844 were checked, including English,
Simplified Chinese and required-field validation.

## Production connection (before enabling live sales)

The user approved local PostgreSQL first; **a production database and deployment
have not been provisioned**. To connect this implementation:

1. Provision PostgreSQL with backups and the provider's secure connection settings.
   Set `DATABASE_URL` and apply the schema to that database.
2. Configure server-only Vercel variables from `.env.example`, using the canonical
   HTTPS `SPONSOR_APP_URL`, independent high-entropy session/cron secrets, the live
   Stripe private key and a live **one-time EUR 50000** Price. Do not copy test
   purchases or secrets into production.
3. Create a Stripe event destination at
   `https://www.unmarker.it/api/sponsors?action=webhook` (or the actual canonical
   origin). Subscribe to `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created` and
   `charge.dispute.closed`. Save that destination's signing secret in
   `STRIPE_WEBHOOK_SECRET`. The CLI listener secret is local only.
4. Configure a scheduler to call the protected `reconcile` endpoint every five
   minutes, or run `pnpm sponsors:reconcile` from a trusted worker with the same
   environment. Monitor non-2xx results, unresolved purchases and webhook failures.
   No production cron or paid hosting plan has been enabled from this worktree.
   Read-time expiry works independently of the scheduler; recovery and analytics
   retry still need scheduled execution.
5. Configure optional `POSTHOG_API_KEY` and `POSTHOG_HOST` for server-confirmed
   purchase/activation events. Test payments are excluded from server analytics.
6. Confirm the live Checkout's displayed total, receipts and required business
   settings; then explicitly set `SPONSOR_ALLOW_LIVE_PAYMENTS=true` and test the
   approved deployment. Live keys remain blocked until this flag is enabled.

A prolonged failure to synchronize an entirely new payment requires investigation:
Stripe's Events API retains historical events for a limited period. Do not invent
a new campaign start time if the original confirmation event cannot be recovered.

## Analytics

Existing viewability, sponsor click/CTR and image-workflow events remain in place.
`kind: house` and `kind: paid` separate owned projects from customers.
`SponsorLayout` updates its observers when the server catalog changes.

- `sponsor_checkout_clicked` remains an intent event.
- `sponsor_purchase_confirmed` and `sponsor_campaign_activated` are emitted from a
  durable server outbox with stable UUIDs and purchase IDs for deduplication.
- Correlation uses the existing client analytics identifier only when capture is
  allowed. No billing email, card detail, icon or creative is sent to PostHog.
- Analytics failure never blocks fulfillment. Test payments never reach the
  production analytics ingestion endpoint.
