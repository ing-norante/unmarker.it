import type { i18n } from "i18next";
import { localeConfigs, type SupportedLocale } from "@/i18n/locales";

export interface DocumentMetadata {
  locale: SupportedLocale;
  canonical: string;
  alternates: readonly { hreflang: "en" | "zh-Hans" | "x-default"; href: string }[];
  title: string;
  description: string;
  keywords: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogLocale: string;
  ogAlternates: readonly [string, string];
  ogImage: string;
  imageAlt: string;
  twitterTitle: string;
  twitterDescription: string;
  jsonLd: Record<string, unknown>;
}

export function createDocumentMetadata(
  locale: SupportedLocale,
  instance: i18n,
): DocumentMetadata {
  const config = localeConfigs[locale];
  const t = instance.getFixedT(locale, "seo");
  const pageId = `${config.canonical}#webpage`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://www.unmarker.it/#website",
        url: "https://www.unmarker.it/",
        name: "Unmarker.it",
        description: t("schema.websiteDescription"),
        inLanguage: ["en", "zh-Hans"],
        publisher: { "@id": "https://www.unmarker.it/#creator" },
      },
      {
        "@type": "WebPage",
        "@id": pageId,
        url: config.canonical,
        name: t("title"),
        description: t("schema.pageDescription"),
        inLanguage: locale,
        isPartOf: { "@id": "https://www.unmarker.it/#website" },
        about: { "@id": "https://www.unmarker.it/#software" },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: config.image,
          width: 1200,
          height: 630,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://www.unmarker.it/#software",
        name: "Unmarker.it",
        url: "https://www.unmarker.it/",
        description: t("schema.softwareDescription"),
        applicationCategory: "MultimediaApplication",
        applicationSubCategory: t("schema.subcategory"),
        operatingSystem: "Web",
        browserRequirements: t("schema.requirements"),
        isAccessibleForFree: true,
        image: {
          "@type": "ImageObject",
          url: config.image,
          width: 1200,
          height: 630,
        },
        sameAs: ["https://github.com/ing-norante/unmarker.it"],
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          t("schema.features.local"),
          t("schema.features.noUploads"),
          t("schema.features.geometry"),
          t("schema.features.noise"),
          t("schema.features.jpeg"),
        ],
        creator: { "@id": "https://www.unmarker.it/#creator" },
      },
      {
        "@type": "Person",
        "@id": "https://www.unmarker.it/#creator",
        name: "Ing. Norante",
        url: "https://github.com/ing-norante",
      },
    ],
  };

  return {
    locale,
    canonical: config.canonical,
    alternates: [
      { hreflang: "en", href: localeConfigs.en.canonical },
      { hreflang: "zh-Hans", href: localeConfigs["zh-Hans"].canonical },
      { hreflang: "x-default", href: localeConfigs.en.canonical },
    ],
    title: t("title"),
    description: t("description"),
    keywords: t("keywords"),
    robots: "index,follow",
    ogTitle: t("ogTitle"),
    ogDescription: t("ogDescription"),
    ogLocale: config.ogLocale,
    ogAlternates: [config.ogAlternates[0], config.ogAlternates[1]],
    ogImage: config.image,
    imageAlt: t("imageAlt"),
    twitterTitle: t("twitterTitle"),
    twitterDescription: t("twitterDescription"),
    jsonLd,
  };
}

const attributeFields: Array<[string, string, keyof DocumentMetadata]> = [
  ["meta-description", "content", "description"],
  ["meta-keywords", "content", "keywords"],
  ["meta-robots", "content", "robots"],
  ["meta-canonical", "href", "canonical"],
  ["meta-og-title", "content", "ogTitle"],
  ["meta-og-description", "content", "ogDescription"],
  ["meta-og-url", "content", "canonical"],
  ["meta-og-locale", "content", "ogLocale"],
  ["meta-og-image", "content", "ogImage"],
  ["meta-og-image-alt", "content", "imageAlt"],
  ["meta-twitter-title", "content", "twitterTitle"],
  ["meta-twitter-description", "content", "twitterDescription"],
  ["meta-twitter-image", "content", "ogImage"],
  ["meta-twitter-image-alt", "content", "imageAlt"],
];

export function applyDocumentMetadataToDom(
  metadata: DocumentMetadata,
  target: Document = document,
) {
  target.documentElement.lang = metadata.locale;
  target.documentElement.dataset.locale = metadata.locale;
  target.title = metadata.title;

  metadata.alternates.forEach((alternate, index) => {
    const element = target.getElementById(`meta-hreflang-${index + 1}`);
    element?.setAttribute("hreflang", alternate.hreflang);
    element?.setAttribute("href", alternate.href);
  });

  for (const [id, attribute, field] of attributeFields) {
    target.getElementById(id)?.setAttribute(attribute, String(metadata[field]));
  }

  target
    .getElementById("meta-og-locale-alternate-1")
    ?.setAttribute("content", metadata.ogAlternates[0]);
  target
    .getElementById("meta-og-locale-alternate-2")
    ?.setAttribute("content", metadata.ogAlternates[1]);

  const structuredData = target.getElementById("structured-data");
  if (structuredData) {
    structuredData.textContent = serializeJsonLd(metadata.jsonLd);
  }
}

export function applyDocumentMetadataToHtml(
  html: string,
  metadata: DocumentMetadata,
) {
  let output = html.replace(
    /<html\b[^>]*>/i,
    `<html lang="${escapeAttribute(metadata.locale)}" data-locale="${escapeAttribute(metadata.locale)}">`,
  );
  output = replaceElementContent(output, "meta-title", escapeHtml(metadata.title));

  metadata.alternates.forEach((alternate, index) => {
    const id = `meta-hreflang-${index + 1}`;
    output = replaceElementAttribute(output, id, "hreflang", alternate.hreflang);
    output = replaceElementAttribute(output, id, "href", alternate.href);
  });

  for (const [id, attribute, field] of attributeFields) {
    output = replaceElementAttribute(output, id, attribute, String(metadata[field]));
  }

  output = replaceElementAttribute(
    output,
    "meta-og-locale-alternate-1",
    "content",
    metadata.ogAlternates[0],
  );
  output = replaceElementAttribute(
    output,
    "meta-og-locale-alternate-2",
    "content",
    metadata.ogAlternates[1],
  );
  output = replaceElementContent(
    output,
    "structured-data",
    serializeJsonLd(metadata.jsonLd),
  );
  return output;
}

function replaceElementAttribute(
  html: string,
  id: string,
  attribute: string,
  value: string,
) {
  const elementPattern = new RegExp(`(<[^>]+\\bid=["']${escapeRegExp(id)}["'][^>]*>)`, "i");
  return html.replace(elementPattern, (element) => {
    const attributePattern = new RegExp(`\\s${escapeRegExp(attribute)}=["'][^"']*["']`, "i");
    const next = ` ${attribute}="${escapeAttribute(value)}"`;
    return attributePattern.test(element)
      ? element.replace(attributePattern, next)
      : element.replace(/>$/, `${next}>`);
  });
}

function replaceElementContent(html: string, id: string, value: string) {
  const pattern = new RegExp(
    `(<([a-z0-9-]+)[^>]+\\bid=["']${escapeRegExp(id)}["'][^>]*>)[\\s\\S]*?(</\\2>)`,
    "i",
  );
  return html.replace(pattern, `$1${value}$3`);
}

function serializeJsonLd(value: Record<string, unknown>) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value: string) {
  return escapeAttribute(value).replaceAll("'", "&#39;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
