import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
import SponsorshipPage from "./SponsorshipPage";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "@/i18n/createI18n";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import {
  createDocumentMetadata,
  applyDocumentMetadataToHtml,
} from "@/i18n/documentMetadata";
import type { SupportedLocale, AppPage } from "@/i18n/locales";

export async function render(locale: SupportedLocale, page: AppPage = "home") {
  const Page = page === "sponsorship" ? SponsorshipPage : App;
  const instance = await createI18n(locale);
  const appHtml = renderToString(
    <StrictMode>
      <I18nextProvider i18n={instance}>
        <LocaleProvider instance={instance} initialLocale={locale}>
          <Page />
        </LocaleProvider>
      </I18nextProvider>
    </StrictMode>,
  );
  return {
    appHtml,
    documentMetadata: createDocumentMetadata(locale, instance, page),
  };
}

export { applyDocumentMetadataToHtml };
