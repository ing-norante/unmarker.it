import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { localeConfigs, type SupportedLocale } from "@/i18n/locales";
import { useLocale } from "@/i18n/LocaleProvider";

const localeOrder: SupportedLocale[] = ["en", "zh-Hans"];

export function LanguageSwitcher() {
  const { t } = useTranslation("common");
  const { locale, selectLocale, recordPreference } = useLocale();

  const handleClick = (
    event: MouseEvent<HTMLAnchorElement>,
    nextLocale: SupportedLocale,
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      recordPreference(nextLocale);
      return;
    }
    event.preventDefault();
    void selectLocale(nextLocale, "language-switcher");
  };

  return (
    <nav
      aria-label={t("language.navigationLabel")}
      className="flex self-end border"
    >
      {localeOrder.map((nextLocale) => (
        <Button
          key={nextLocale}
          asChild
          size="sm"
          variant={locale === nextLocale ? "default" : "ghost"}
          className="rounded-none border-0 px-3 font-black"
        >
          <a
            href={localeConfigs[nextLocale].path}
            hrefLang={nextLocale}
            lang={nextLocale}
            aria-current={locale === nextLocale ? "page" : undefined}
            onClick={(event) => handleClick(event, nextLocale)}
          >
            {nextLocale === "en"
              ? t("language.english")
              : t("language.simplifiedChinese")}
          </a>
        </Button>
      ))}
    </nav>
  );
}
