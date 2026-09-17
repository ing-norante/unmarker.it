import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initAnalytics } from "@/lib/analytics";
import { I18nextProvider } from "react-i18next";
import { initializeClientI18n } from "@/i18n/createI18n";
import {
  resolveLocaleFromPathname,
  resolvePageFromPathname,
} from "@/i18n/locales";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import {
  applyDocumentMetadataToDom,
  createDocumentMetadata,
} from "@/i18n/documentMetadata";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppErrorFallback } from "@/components/AppErrorFallback";

async function bootstrap() {
  const locale = resolveLocaleFromPathname(window.location.pathname);
  const page = resolvePageFromPathname(window.location.pathname);
  const Page =
    page === "sponsorship" ? (await import("./SponsorshipPage")).default : App;
  const instance = await initializeClientI18n(locale);
  applyDocumentMetadataToDom(createDocumentMetadata(locale, instance, page));

  const app = (
    <StrictMode>
      <I18nextProvider i18n={instance}>
        <LocaleProvider instance={instance} initialLocale={locale}>
          <ErrorBoundary fallback={<AppErrorFallback />}>
            <Page />
          </ErrorBoundary>
        </LocaleProvider>
      </I18nextProvider>
    </StrictMode>
  );
  const root = document.getElementById("root")!;

  if (root.hasChildNodes()) hydrateRoot(root, app);
  else createRoot(root).render(app);

  // Optional analytics must not gate hydration or file selection.
  void initAnalytics(locale).catch((error: unknown) => {
    console.warn("Analytics initialization failed", error);
  });
}

void bootstrap();
