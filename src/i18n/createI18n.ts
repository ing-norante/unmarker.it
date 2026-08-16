import i18next, { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import type { SupportedLocale } from "@/i18n/locales";
import { defaultNamespace, resources } from "@/i18n/resources";

function options(locale: SupportedLocale) {
  return {
    resources,
    lng: locale,
    fallbackLng: "en",
    defaultNS: defaultNamespace,
    supportedLngs: ["en", "zh-Hans"],
    load: "currentOnly" as const,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  };
}

export async function createI18n(locale: SupportedLocale): Promise<i18n> {
  const instance = createInstance();
  await instance.use(initReactI18next).init(options(locale));
  return instance;
}

export async function initializeClientI18n(locale: SupportedLocale) {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init(options(locale));
  } else if (i18next.language !== locale) {
    await i18next.changeLanguage(locale);
  }
  return i18next;
}
