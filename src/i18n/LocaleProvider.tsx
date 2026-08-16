import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { flushSync } from "react-dom";
import type { i18n } from "i18next";
import {
  applyDocumentMetadataToDom,
  createDocumentMetadata,
} from "@/i18n/documentMetadata";
import {
  localeConfigs,
  resolveLocaleFromPathname,
  type SupportedLocale,
} from "@/i18n/locales";
import {
  capturePageview,
  registerAnalyticsLocale,
  trackLocaleAction,
} from "@/lib/analytics";

const PREFERENCE_KEY = "unmarker.locale.preference";
const SUGGESTION_KEY = "unmarker.localeSuggestion.zh-Hans";

type LocaleSelectionSource = "language-switcher" | "locale-suggestion";

interface LocaleContextValue {
  locale: SupportedLocale;
  explicitPreference: SupportedLocale | null;
  suggestionDecision: "accepted" | "dismissed" | null;
  selectLocale: (
    locale: SupportedLocale,
    source: LocaleSelectionSource,
  ) => Promise<void>;
  dismissSuggestion: () => Promise<void>;
  recordPreference: (locale: SupportedLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  instance,
  initialLocale,
  children,
}: PropsWithChildren<{ instance: i18n; initialLocale: SupportedLocale }>) {
  const [locale, setLocale] = useState(initialLocale);
  const [explicitPreference, setExplicitPreference] =
    useState<SupportedLocale | null>(null);
  const [suggestionDecision, setSuggestionDecision] = useState<
    "accepted" | "dismissed" | null
  >(null);

  useEffect(() => {
    queueMicrotask(() => {
      const preference = localStorage.getItem(PREFERENCE_KEY);
      if (preference === "en" || preference === "zh-Hans") {
        setExplicitPreference(preference);
      }
      const decision = localStorage.getItem(SUGGESTION_KEY);
      if (decision === "accepted" || decision === "dismissed") {
        setSuggestionDecision(decision);
      }
    });
  }, []);

  const applyLocale = useCallback(
    async (nextLocale: SupportedLocale, pushHistory: boolean) => {
      await instance.changeLanguage(nextLocale);
      flushSync(() => setLocale(nextLocale));

      if (
        pushHistory &&
        window.location.pathname !== localeConfigs[nextLocale].path
      ) {
        window.history.pushState({}, "", localeConfigs[nextLocale].path);
      }

      applyDocumentMetadataToDom(createDocumentMetadata(nextLocale, instance));
      await registerAnalyticsLocale(nextLocale);
    },
    [instance],
  );

  const recordPreference = useCallback((nextLocale: SupportedLocale) => {
    localStorage.setItem(PREFERENCE_KEY, nextLocale);
    setExplicitPreference(nextLocale);
    const suggestionStatus =
      nextLocale === "zh-Hans" ? "accepted" : "dismissed";
    localStorage.setItem(SUGGESTION_KEY, suggestionStatus);
    setSuggestionDecision(suggestionStatus);
  }, []);

  const selectLocale = useCallback(
    async (nextLocale: SupportedLocale, source: LocaleSelectionSource) => {
      recordPreference(nextLocale);

      if (nextLocale === locale) {
        return;
      }

      await applyLocale(nextLocale, true);
      await trackLocaleAction(
        source === "locale-suggestion"
          ? "locale_suggestion_accepted"
          : "locale_switched",
        source === "locale-suggestion"
          ? "locale_suggestion"
          : "language_switcher",
        {
          from_locale: locale,
          to_locale: nextLocale,
          source,
        },
      );
      await capturePageview();
    },
    [applyLocale, locale, recordPreference],
  );

  const dismissSuggestion = useCallback(async () => {
    localStorage.setItem(PREFERENCE_KEY, "en");
    localStorage.setItem(SUGGESTION_KEY, "dismissed");
    setExplicitPreference("en");
    setSuggestionDecision("dismissed");
    await trackLocaleAction(
      "locale_suggestion_dismissed",
      "locale_suggestion",
      {
        from_locale: locale,
        suggested_locale: "zh-Hans",
        source: "locale-suggestion",
      },
    );
  }, [locale]);

  useEffect(() => {
    const handlePopState = () => {
      const nextLocale = resolveLocaleFromPathname(window.location.pathname);
      if (nextLocale === locale) return;
      void applyLocale(nextLocale, false).then(capturePageview);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyLocale, locale]);

  const value = useMemo(
    () => ({
      locale,
      explicitPreference,
      suggestionDecision,
      selectLocale,
      dismissSuggestion,
      recordPreference,
    }),
    [
      dismissSuggestion,
      explicitPreference,
      locale,
      recordPreference,
      selectLocale,
      suggestionDecision,
    ],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
