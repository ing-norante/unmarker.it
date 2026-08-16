import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initAnalytics } from "@/lib/analytics";
import { I18nextProvider } from "react-i18next";
import { initializeClientI18n } from "@/i18n/createI18n";
import { resolveLocaleFromPathname } from "@/i18n/locales";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { applyDocumentMetadataToDom, createDocumentMetadata } from "@/i18n/documentMetadata";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppErrorFallback } from "@/components/AppErrorFallback";

async function bootstrap() {
  const locale = resolveLocaleFromPathname(window.location.pathname);
  const instance = await initializeClientI18n(locale);
  applyDocumentMetadataToDom(createDocumentMetadata(locale, instance));
  await initAnalytics(locale);

  const app = (
    <StrictMode>
      <I18nextProvider i18n={instance}>
        <LocaleProvider instance={instance} initialLocale={locale}>
          <ErrorBoundary fallback={<AppErrorFallback />}>
            <App />
          </ErrorBoundary>
        </LocaleProvider>
      </I18nextProvider>
    </StrictMode>
  );
  const root = document.getElementById("root")!;

  if (root.hasChildNodes()) hydrateRoot(root, app);
  else createRoot(root).render(app);
}

void bootstrap();
