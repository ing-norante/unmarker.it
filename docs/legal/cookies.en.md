# Unmarker.it Cookie Policy and Preferences

> Version v1.0.0 · Effective 18 September 2026.

## Controller and purposes

Unmarker.it is operated by NOMADE - S.R.L., Via Luigi Salvatore Cherubini 10,
50121 Florence (FI), Italy, Italian VAT and tax code 07505480488. Contact:
help@nomadesrl.it.

We use necessary tools to remember preferences and manage purchases. With
consent, we use PostHog for usage statistics and diagnostics: visits, completion
of the image workflow, sponsor impressions and clicks, purchase conversions,
application errors and browser performance. The data are pseudonymous, not
anonymous. We do not upload images processed with the tool. A public icon
uploaded for a sponsor campaign is processed separately.

## Two categories

- **Necessary, always active:** requested preferences and the secure purchase
  session. These are not used for statistics and do not depend on analytics
  consent.
- **Statistics and diagnostics — PostHog, optional:** all measurements listed
  above require consent, including purchase events sent by the server. The
  site does not use a separate marketing category, advertising profiling or
  session replay.

## Inventory

| Tool                                                                            | Purpose                                                                                                      | Duration                                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `unmarker_sponsor_session`, HttpOnly cookie, SameSite=Lax, path `/api/sponsors` | Purchase session and access to orders from the same browser; choosing cookie preferences does not create it. | 120 days; server record retention is separate.                                                           |
| `unmarker.locale.preference`, localStorage                                      | Chosen language.                                                                                             | Until deleted by the browser.                                                                            |
| `unmarker.localeSuggestion.zh-Hans`, localStorage                               | Remembers the response to the language suggestion.                                                           | Until deleted by the browser.                                                                            |
| `chunk-reload:*`, sessionStorage                                                | Prevents repeated reloads after a loading error.                                                             | For the tab's session, or removed after successful loading.                                              |
| `unmarker_consent`, localStorage                                                | Choice, date, notice version and expiry, with no additional personal identifier.                             | Choice valid for six months; an expired record is replaced when a new choice is made.                    |
| `ph_<project-key>*`, localStorage and SDK session data                          | Pseudonymous identifiers, session and properties for consented analytics.                                    | No native localStorage expiry; removed on withdrawal or when the app detects missing or expired consent. |
| `__ph_opt_in_out_<project-key>`, localStorage                                   | Technical SDK opt-in state after acceptance.                                                                 | Removed with the identifiers on withdrawal; the necessary choice remains in `unmarker_consent`.          |

The SDK uses localStorage and does not share analytics cookies across
subdomains. Withdrawal also attempts to remove any previous PostHog cookies
for this project on the current domain and applicable parent domains. Local
storage is not automatically cleared while the site is closed: consent expiry
is checked on the next visit and in open tabs.

Stripe Checkout is a separate page and may use tools necessary for payment and
fraud prevention, described in [Stripe's Privacy Policy](https://stripe.com/privacy).
Unmarker.it preferences govern analytics on our site and do not replace
Stripe's information about its own processing.

## Choosing, changing and withdrawing consent

The banner offers **Reject analytics**, **Accept analytics** and **Preferences**
without covering or blocking the site. Acceptance and rejection have equal
prominence; the X means rejection. Scrolling or continuing to browse does not
constitute consent. The optional category is off by default.

The **Cookie preferences** button in the footer lets visitors change their
choice or withdraw consent with **Reject analytics** at any time. Closing the
preferences without saving does not change the choice. Rejection does not
limit site functionality.

The choice is remembered for six months in that browser when storage is
available. Visitors may be asked again after it expires, if the browser no
longer stores the preference or if the processing purposes change materially.
An editorial revision must not reset previous rejections.

PostHog is not initialised before acceptance, and earlier events are not
collected retroactively. After withdrawal, browser collection and sending
stop, including queued retry attempts; local identifiers are removed and
the choice propagates to other tabs of the same site.

For a person who purchased from the same browser, withdrawal also updates the
server, removing the analytics association from purchases and discarding
events still pending. If the connection is unavailable, local blocking takes
effect immediately and a notice appears to complete synchronisation; the
site retries when online or through the dedicated button. Browser withdrawal
cannot stop a server event sent before the server receives the request, or
recall data already transmitted.

Withdrawal does not erase data already collected lawfully or administrative
records. Contact the controller to exercise other rights. Deleting the purchase
session or changing devices may require support to find an order; devices are
not linked to circumvent a rejection.

## Analytics and retention

An audit of the Unmarker.it PostHog project found session replay disabled.
The app also explicitly disables it, together with click autocapture,
rageclicks, heatmaps, surveys, tours and conversations. Explicit application
events, technical errors and Web Vitals remain, all subject to consent.
Query parameters and URL fragments are removed from navigation events.

We use PostHog Cloud EU on the Free plan, for which the provider specifies
an expected analytics retention window of 12 months. The application of
retention to this project and actual data deletion require verification: the
plan limit alone does not guarantee automatic deletion. NoMaDe reviews data
that are no longer necessary at least annually and manages their deletion
using the provider's tools. Event retention is separate from the six-month
preference stored in the browser. Information about
[recipients, transfers and retention](/legal/privacy) is in the Privacy Policy.

Sponsor and image workflow statistics represent only the sample of visitors
who consented. Administrative payment records have purposes and legal bases
separate from analytics consent.

References: the Italian Data Protection Authority's
[cookie FAQ](https://www.garanteprivacy.it/faq/cookie) and
[guidelines of 10 June 2021](https://www.gpdp.it/home/docweb/-/docweb-display/docweb/9677876).
