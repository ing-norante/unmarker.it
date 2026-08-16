# SEO Action Plan: Unmarker.it

This plan is ordered by likely organic-search impact, not by engineering convenience.

## High priority — next 1–2 weeks

| # | Action | Why | Effort | Acceptance check |
|---|---|---|---:|---|
| 1 | Qualify the English and Chinese hero promise | Broad “AI watermark remover” intent implies capabilities beyond the tool’s precise scope | S | Hero names metadata/provenance analysis, supported Gemini mark handling, and hidden-signal disruption without universal claims |
| 2 | Hydrate before initializing analytics | Mobile Lighthouse LCP is 3.1 s and `initAnalytics` currently blocks hydration | S–M | `src/main.tsx` no longer awaits analytics before render; two mobile Lighthouse runs show improved or non-regressed LCP |
| 3 | Add a crawlable scope-and-limitations matrix | Resolves intent mismatch, improves trust, and creates quotable passages for AI/search | M | SSR HTML contains a clear layer/example/action/output/guarantee matrix in both languages |
| 4 | Put evidence beside claims | Current research and creator links are deferred; promotional claims lack inline support | S–M | SSR facts section links the relevant arXiv/Waterloo sources and qualifies unmeasured claims |

Suggested hero positioning:

> Analyze AI provenance, remove supported Gemini marks, clean metadata, and disrupt hidden watermark signals—locally in your browser.

Translate for meaning and supported scope rather than mirroring keywords mechanically.

## Medium priority — next 30 days

| # | Action | Why | Effort | Acceptance check |
|---|---|---|---:|---|
| 5 | Publish and link a privacy disclosure | Clarifies that image bytes stay local while optional anonymous analytics may operate | M | Page states what is processed locally, what analytics are sent, retention/provider details, and excluded image-derived data |
| 6 | Change schema subtype to `WebApplication` | Fixes the live Schema.org `browserRequirements` warning | S | Both locale graphs validate with zero errors/warnings for the software subtype |
| 7 | Compress the two OG images | EN is 399 KiB and ZH is 861 KiB | S | Locale images remain 1200×630 and are approximately 100–200 KiB without visible quality loss |
| 8 | Add OG image dimensions and type | Improves deterministic social preview parsing | S | Both locales emit `og:image:width`, `og:image:height`, and `og:image:type` |
| 9 | Make apex redirects direct and permanent | Current apex HTTPS uses 307; HTTP apex takes two hops | S | All apex/protocol variants reach the matching `www` path in one 301/308 hop |
| 10 | Cache fingerprinted assets immutably | Current hashed assets revalidate on repeat visits | S | `/assets/*` returns `public, max-age=31536000, immutable` |
| 11 | Expand purposeful visible content | Current copy is concise but lacks scope, proof, examples, and common questions | M | EN reaches roughly 450–650 useful words with equivalent Chinese coverage; no filler or unsupported claims |
| 12 | Add an evidence/demo block | SERP competitors commonly provide before/after proof and supported-provider detail | M–L | Page shows a truthful example, methodology, detector/version, sample size, quality metric, failure cases, and test date |
| 13 | Improve Chinese AI guidance | Root `llms.txt` is English-only | S | `llms.txt` lists both canonical language URLs and includes or links concise Chinese product facts |

Do not add fabricated ratings to unlock Software App rich results. Add `review` or `aggregateRating` only when genuine reviews are visible on the page and maintained consistently.

## Low priority — backlog

| Action | Notes |
|---|---|
| Increase small-control hit areas toward 44 px | Preserve the compact visual design while enlarging clickable padding |
| Reduce short-mobile first-screen spacing | Keep the upload CTA visible around 320×568 where practical |
| Preload the main self-hosted font | Re-measure; keep only if repeat Lighthouse runs improve |
| Narrow CSP allowances | Isolate OpenCV eval permissions and replace inline allowances with nonces/hashes where practical |
| Consider HSTS `includeSubDomains` and preload | Only after every current and future subdomain is guaranteed HTTPS-only |
| Consider IndexNow | Low value for a stable two-page site; useful only if rapid Bing-family discovery matters |
| Add `alternateName` and accurate version/date schema | Maintain `softwareVersion` and `dateModified` only when reliably updated |

## Measurement plan

After deployment:

1. Run two mobile and one desktop Lighthouse audits against production; record LCP, CLS, TBT, transferred bytes, and unused JavaScript.
2. Validate both locale graphs in Schema.org Validator and Google Rich Results Test.
3. Check all host/protocol/locale redirect variants and both canonical URLs.
4. Inspect both URLs in Google Search Console; request recrawl only after final metadata/content deployment.
5. Track impressions, CTR, query intent, locale, upload starts, successful outputs, and returning usage without collecting image content or filenames.
6. Reassess title/H1 positioning from real GSC queries after 4–8 weeks instead of guessing keyword demand.

## Recommended implementation order

1. Hero scope and claim qualification
2. Analytics/hydration performance fix
3. Scope matrix and inline citations
4. Schema and OG metadata fixes
5. OG compression and caching/redirect headers
6. Privacy, benchmark, and expanded bilingual content
7. GSC validation and iterative CTR/SXO refinement

