# Sponsor sandbox preview

The `codex/sponsor-preview` branch contains PR #9 for online QA before merging
`main`. Its stable checkout origin is:

https://unmarker-it-sponsor-preview.vercel.app

## Isolation

- Vercel project: `unmarker-it`, **Preview** environment, branch-specific variables.
- Neon project: `unmarker-postgres-production-db`, isolated branch
  `sponsor-preview` (`br-red-bonus-avhdbxtl`), database `unmarker_stripe_sandbox`.
  The previous account's test records remain in `neondb`; they must not be reused
  with the new account's Stripe credentials.
- `SPONSOR_DATABASE_URL` explicitly selects that branch, independently of the
  Marketplace-managed `DATABASE_URL`. The API, migrations and test runner use
  this override when present and otherwise fall back to `DATABASE_URL`.
- Stripe sandbox `acct_1UGRgJEO1GBBIQQi`, belonging to the dedicated Unmarker live
  account `acct_1UGRfqCwozMNRcOx`, and the €500 one-time test price
  `price_1UGRr4EO1GBBIQQijDtIUQo2`. Live payments
  remain disabled. A dedicated test webhook receives events at
  `/api/sponsors?action=webhook` on the stable origin above.
- Separate session and reconciliation secrets. The branch-specific empty
  `VITE_PUBLIC_POSTHOG_KEY` prevents QA traffic from entering production analytics.
- Credentials live in Vercel environment variables, never in this repository.
  The app uses `STRIPE_PRIVATE_KEY`; if the source environment calls the key
  `STRIPE_SECRET_KEY`, map it to `STRIPE_PRIVATE_KEY` when configuring the preview.

## Updating the preview

Merge the latest PR branch into `codex/sponsor-preview` and push. Use a Vercel
**Git deployment** of this branch so branch-scoped variables are resolved. If
starting a deployment through the API, provide `gitSource` with the repository
and branch, leaving the production target unset.

After the deployment is ready, assign the stable alias to its new URL:

```sh
vercel alias set <deployment-url> unmarker-it-sponsor-preview.vercel.app \
  --scope giuseppes-projects-3d0920ac
```

Use the stable origin for browser QA: the session endpoint deliberately rejects
other origins and Stripe returns to `SPONSOR_APP_URL`.

## Checks

1. `/api/sponsors` returns `checkoutEnabled: true` and `testMode: true`.
2. Advertise accepts the creative and opens the €500 Stripe test checkout.
3. A successful test payment activates the sponsor; refreshing retains it.
4. Cancelling an unpaid checkout releases its reservation.
5. A test refund removes the paid card after the signed webhook arrives.
6. Call `/api/sponsors?action=reconcile` with `Authorization: Bearer <CRON_SECRET>`
   to exercise reconciliation manually; unauthenticated calls must return 403.

Vercel's scheduled Cron Jobs run on production deployments. Preview QA uses
the protected reconciliation endpoint manually. Production configuration and
merging PR #9 remain separate steps after QA.
