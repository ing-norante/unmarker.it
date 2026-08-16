import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { prefersSimplifiedChinese } from "@/i18n/locales";
import { useLocale } from "@/i18n/LocaleProvider";
import { trackLocaleAction } from "@/lib/analytics";

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function LocaleSuggestion() {
  const { t } = useTranslation("common");
  const {
    locale,
    explicitPreference,
    suggestionDecision,
    selectLocale,
    dismissSuggestion,
  } = useLocale();
  const [visible, setVisible] = useState(false);
  const eligible =
    locale === "en" &&
    !explicitPreference &&
    !suggestionDecision &&
    prefersSimplifiedChinese(
      typeof navigator === "undefined" ? [] : navigator.languages,
    );

  useEffect(() => {
    if (!eligible) return;

    const idleWindow = window as IdleWindow;
    const show = () => {
      setVisible(true);
      void trackLocaleAction("locale_suggestion_shown", "locale_suggestion", {
        from_locale: locale,
        suggested_locale: "zh-Hans",
        source: "locale-suggestion",
      });
    };
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(show, { timeout: 2500 });
      return () => idleWindow.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(show, 1800);
    return () => window.clearTimeout(id);
  }, [eligible, locale]);

  if (!visible || !eligible) return null;

  return (
    <Alert className="bg-background fixed right-4 bottom-4 left-4 z-40 mx-auto max-w-md shadow-xl sm:right-6 sm:left-auto">
      <AlertTitle>{t("suggestion.title")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{t("suggestion.description")}</span>
        <span className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => void selectLocale("zh-Hans", "locale-suggestion")}
          >
            {t("suggestion.accept")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void dismissSuggestion()}
          >
            {t("suggestion.dismiss")}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
