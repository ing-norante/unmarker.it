export type SupportedLocale = "en" | "zh-Hans";

export interface LocaleConfig {
  locale: SupportedLocale;
  path: "/" | "/zh-hans/";
  canonical: string;
  label: string;
  ogLocale: "en_US" | "zh_CN";
  ogAlternates: readonly string[];
  image: string;
}

export const supportedLocales = ["en", "zh-Hans"] as const;

export const localeConfigs: Record<SupportedLocale, LocaleConfig> = {
  en: {
    locale: "en",
    path: "/",
    canonical: "https://www.unmarker.it/",
    label: "EN",
    ogLocale: "en_US",
    ogAlternates: ["zh_CN", "zh_SG"],
    image: "https://www.unmarker.it/og-image.png",
  },
  "zh-Hans": {
    locale: "zh-Hans",
    path: "/zh-hans/",
    canonical: "https://www.unmarker.it/zh-hans/",
    label: "简体中文",
    ogLocale: "zh_CN",
    ogAlternates: ["zh_SG", "en_US"],
    image: "https://www.unmarker.it/og-image-zh-hans.png",
  },
};

export function resolveLocaleFromPathname(pathname: string): SupportedLocale {
  const normalized = pathname.toLowerCase().replace(/\/+$/, "");
  return normalized === "/zh-hans" ? "zh-Hans" : "en";
}

export function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale);
}

export function prefersSimplifiedChinese(languages: readonly string[]) {
  const rawLocale = languages.find((language) =>
    language.replaceAll("_", "-").toLowerCase().startsWith("zh"),
  );
  if (!rawLocale) return false;

  try {
    const locale = new Intl.Locale(rawLocale.replaceAll("_", "-"));
    if (locale.language !== "zh") return false;
    if (locale.script === "Hant") return false;
    if (["TW", "HK", "MO"].includes(locale.region ?? "")) return false;
    return (
      locale.script === "Hans" ||
      ["CN", "SG"].includes(locale.region ?? "") ||
      (!locale.script && !locale.region)
    );
  } catch {
    return false;
  }
}
