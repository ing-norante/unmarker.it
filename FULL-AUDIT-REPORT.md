# Full SEO Audit Report: Unmarker.it

- Audit date: 2026-08-16
- Audited site: https://www.unmarker.it/
- Pages crawled: 2 canonical HTML pages, plus robots, sitemap, llms.txt, redirects, assets, and 404 behavior
- Business type: free browser-based image utility / web application
- Overall SEO Health Score: **80/100**

## Executive summary

Unmarker.it has strong technical foundations. Both English and Simplified Chinese pages are prerendered, indexable, canonicalized, localized, fast on desktop, and supported by valid hreflang, sitemap, security headers, structured data, and a detailed `llms.txt` file. The previous May 2026 findings about a JavaScript shell, host mismatch, generic manifest, and missing schema are obsolete.

The main SEO constraint is now positioning and evidence. The broad “AI Watermark Remover” promise overlaps SERPs dominated by visible logo/text removal tools, while Unmarker.it’s defensible specialty is more precise: local provenance analysis, metadata cleanup, supported Gemini sparkle handling, and disruption of hidden watermark signals. The page explains this, but too late and without a compact scope matrix, visible benchmark, or before/after proof.

## Scorecard

| Category | Score | Weight | Assessment |
|---|---:|---:|---|
| Technical SEO | 90 | 22% | Strong crawlability and rendering; redirect/cache hygiene remains |
| Content quality | 68 | 23% | Accurate and transparent, but thin and technically dense |
| On-page SEO | 84 | 20% | Good metadata and hierarchy; broad-intent positioning needs refinement |
| Schema / structured data | 82 | 10% | Valid graph with one Schema.org warning |
| Performance / CWV | 90 | 10% | Excellent desktop; mobile lab LCP needs improvement |
| AI search readiness | 68 | 10% | Strong machine access; limited visible citations and Chinese guidance |
| Images | 78 | 5% | No landing-page image issues; social images are oversized |
| **Weighted overall** | **80** | **100%** | **Strong foundation, meaningful growth opportunities** |

## Top priorities

1. Qualify the hero promise so users and search engines immediately understand which watermark layers are detected, altered, removed, or not independently verifiable.
2. Remove analytics initialization from the hydration-critical path to improve the measured 3.1-second mobile LCP.
3. Add a crawlable “what it handles” matrix, inline research citations, and compact proof of output quality or limitations.
4. Publish a clear privacy disclosure distinguishing local image processing from optional anonymous usage analytics.
5. Compress the locale-specific social images and correct the software schema subtype.

## Technical SEO

### Confirmed passes

- `robots.txt` returns 200, permits crawling, and declares the sitemap.
- `sitemap.xml` is valid and lists exactly the two canonical language pages.
- Both pages return 200 with `index,follow`, self-canonicals, unique metadata, and meaningful prerendered HTML.
- Random missing URLs return genuine 404 responses.
- English and `zh-Hans` hreflang annotations are reciprocal, self-referential, canonical-aligned, HTTPS-only, and include `x-default`.
- Security headers include HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.
- HTTPS certificates were valid for the apex and `www` hosts.

### Findings

- `https://unmarker.it/` redirects to `www` with temporary HTTP 307. `http://unmarker.it/` takes two hops: 308 then 307. Configure a direct permanent 308 to the final HTTPS `www` URL.
- Fingerprinted JS, CSS, and font assets return `Cache-Control: public, max-age=0, must-revalidate`. Serve hashed `/assets/*` with `max-age=31536000, immutable`.
- The CSP is structurally strong but allows `unsafe-inline` and `unsafe-eval`. OpenCV currently needs eval permissions; isolate those permissions to the worker or resource response where practical.
- IndexNow is absent. This is optional and low-impact for a two-page site.

## Performance and Core Web Vitals

Lighthouse 13.0.1 lab results:

| Profile | Performance | FCP | LCP | TBT | CLS |
|---|---:|---:|---:|---:|---:|
| Mobile run 1 | 89 | 2.1 s | 3.1 s | 0 ms | 0 |
| Mobile run 2 | 91 | 2.2 s | 3.1 s | 0 ms | 0 |
| Desktop | 100 | 0.4 s | 0.4 s | 0 ms | 0.00046 |

Mobile LCP is in the “needs improvement” band. The LCP element is the hero paragraph. The main implementation opportunity is `src/main.tsx`, where application startup awaits analytics before hydration. Hydrate first, then initialize PostHog during idle time or after the first render. Also consider preloading the self-hosted Geist Mono font.

The initial transfer is approximately 280–307 KiB, with roughly 107 KiB of unused JavaScript estimated by Lighthouse. Field LCP, INP, and CLS were unavailable, so lab metrics must not be treated as real-user CWV.

## Content quality and E-E-A-T

- English has approximately 260–274 words, about half of the skill’s 500-word homepage guideline. A functional utility can legitimately be concise, but the missing words correspond to useful scope, proof, examples, and limitations rather than filler.
- English readability is technically dense: Flesch approximately 31.6 and grade level 12.3. Terms such as “adversarial disruption,” “perturbations,” “provenance,” and “recompression” should remain where needed, but the first explanation should be simpler.
- Simplified Chinese has close structural parity and approximately 488 Han characters. Western word-count thresholds were not applied to CJK text.
- Strong experience/trust signals include the working tool, precise input limits, detailed workflow, limitations, responsible-use copy, and open-source repository.
- Authority is weaker on the visible page. Research citations and creator information are deferred into the client-rendered footer rather than present in initial HTML beside the claims they support.
- Claims such as “Blazing Fast,” “neutralizes,” “mathematically precise,” and “without visible degradation” need measurement, qualification, or softer wording.
- No visible privacy, terms, about, or contact page explains governance. “No data leaving your device” should explicitly mean image bytes/pixels; disclose any page/action analytics and confirm that filenames and image-derived data are excluded.

## On-page SEO and search experience

### Strong signals

- English title: 51 characters; description: 158 characters.
- Both locales use one descriptive H1, two H2s, four H3s, and natural keyword frequency without stuffing.
- The interactive upload tool is above the fold, has no login wall, and clearly states formats, limits, and privacy.
- The page type matches the dominant tool/interactive SERP format.

### Intent gap

Broad “AI watermark remover” results commonly promise visible logo, text, or date-stamp removal. Unmarker.it instead combines provenance analysis, metadata cleanup, supported Gemini visible-mark handling, and hidden-signal disruption. State this exact scope in or immediately below the hero.

Add a crawlable matrix with columns such as layer, examples, detection, action, output, and guarantee status. Follow it with a concise three-step workflow, a real example or benchmark, and 3–5 visible FAQs. FAQ content is useful, but adding `FAQPage` schema is not recommended for Google rich-result benefit on this commercial utility.

## Structured data

Both locales include one prerendered JSON-LD graph containing `WebSite`, `WebPage`, `SoftwareApplication`, and `Person`.

The graph has valid syntax, absolute URLs, localized fields, stable entity IDs, offers, images, and GitHub identity linkage. Schema.org Validator reported zero errors and one warning: `browserRequirements` is not valid directly on `SoftwareApplication`; it belongs on `WebApplication`. Change the software entity subtype to `WebApplication`.

The graph is valid for entity understanding, but it is not eligible for Google’s Software App rich result without a genuine visible `aggregateRating` or `review`. Do not invent or self-author ratings solely for markup eligibility.

## Images

- The landing state contains no raster `<img>` elements, so there are no missing-alt, responsive-image, lazy-loading, or image-LCP issues.
- Dynamic user-preview images have localized alt text. Their missing intrinsic dimensions are low priority because fixed containers constrain layout and blob images are not indexable content.
- Both OG images are correctly localized, 1200×630, return 200, and include social alt text.
- `og-image.png` is 399,360 bytes; `og-image-zh-hans.png` is 861,441 bytes. Re-export both as high-quality JPEGs around 90–100 KiB, or at minimum palette-optimize the PNGs.
- Add `og:image:width`, `og:image:height`, and `og:image:type`; revise “interface” alt text if the files are promotional graphics rather than interface screenshots.

## AI search and GEO readiness

### Strong signals

- AI crawlers are not blocked by robots rules.
- Root `llms.txt` is detailed and includes product facts, workflow, limitations, responsible use, and references.
- Core content, headings, metadata, and JSON-LD are available in initial HTML.
- The page uses fact-oriented sections and precise technical constraints.

### Gaps

- `llms.txt` is English-only and does not clearly list the Chinese language URL.
- The visible page lacks a compact, self-contained answer block, scope matrix, cited factual claims, and versioned original evidence.
- Research and creator links are deferred from initial HTML, reducing their usefulness to non-rendering extractors.
- `sameAs` contains only GitHub. Add only genuine official profiles or press references.

## International SEO

The two-page hreflang cluster passes. Both pages contain `en`, `zh-Hans`, and one `x-default`; return tags, canonicals, protocol, host, and trailing slashes match. HTML and sitemap annotations duplicate maintenance but are valid while identical.

The Simplified Chinese implementation is structurally and semantically strong. Its main gap is search intent: Chinese SERPs skew even more heavily toward broad visible-watermark removal, so the localized hero must be especially precise about supported behavior.

## Visual and mobile review

- Desktop and responsive layouts are clean, stable, and free of horizontal overflow.
- Primary upload CTA is visible at 390×844, but can fall below the first screen at 320×568. Reduce early vertical spacing or uploader minimum height for short mobile viewports.
- Language controls are approximately 26–28 px high, theme control approximately 36 px, and upload CTA approximately 37.5 px. They pass Lighthouse spacing checks and the WCAG 2.2 24 px minimum, but a roughly 44 px hit area would improve touch comfort.
- The page would benefit from a compact before/after or “what changes / what remains” visual below the uploader.

## Search visibility snapshot

A public web search surfaced the English homepage for the brand/domain, but did not surface the newly deployed Chinese URL in the sampled results. This is not proof of an indexing problem; the sitemap reports a 2026-08-16 update. Verify discovery and canonical selection in Google Search Console after recrawl.

## Limitations

- No Google Search Console, GA4, or authenticated CrUX data was available.
- The unauthenticated PageSpeed API returned HTTP 429; Lighthouse was run locally against production instead.
- INP is unknown and was not inferred from TBT.
- DataForSEO, Firecrawl, Moz, and Bing Webmaster integrations were unavailable.
- SERP sampling was not a locale-controlled Google top-10 export and did not provide search volume or ranking positions.
- No sample image was uploaded, so post-upload performance, quality, and conversion usability were outside scope.
- Schema was checked with Schema.org Validator and official documentation, not Google’s interactive Rich Results Test.
- This is an SEO and usability audit, not legal or privacy compliance advice.

