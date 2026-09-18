import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { XIcon } from "@phosphor-icons/react/dist/ssr/X";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { legalDocuments } from "@/lib/legalDocuments";
import {
  getConsent,
  getServerConsent,
  subscribeConsent,
  saveConsent,
  getConsentSyncFailed,
  getServerSyncFailed,
  subscribeConsentSync,
  syncSponsorConsent,
} from "@/lib/cookieConsent";

export function CookieConsent() {
  const { t } = useTranslation("common");
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsent,
    getServerConsent,
  );
  const syncFailed = useSyncExternalStore(
    subscribeConsentSync,
    getConsentSyncFailed,
    getServerSyncFailed,
  );
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const showPreferences = () => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setAnalytics(getConsent()?.analytics ?? false);
    setOpen(true);
  };
  useEffect(() => {
    const show = () => showPreferences();
    window.addEventListener("unmarker:cookie-preferences", show);
    const fromLink = () => {
      if (window.location.hash === "#cookie-preferences") show();
    };
    window.addEventListener("hashchange", fromLink);
    // Defer until hydration has finished; a legal page can link here directly.
    const timer = window.setTimeout(fromLink, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", fromLink);
      window.removeEventListener("unmarker:cookie-preferences", show);
    };
  }, []);
  const choose = (enabled: boolean) => {
    saveConsent(enabled);
    setOpen(false);
  };
  const policyLinks = (
    <p className="text-muted-foreground text-xs leading-5">
      <a
        href={legalDocuments.privacy}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {t("footer.privacy")}
      </a>
      {" · "}
      <a
        href={legalDocuments.cookies}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4"
      >
        {t("footer.cookies")}
      </a>
    </p>
  );
  return (
    <>
      {(!consent || syncFailed) && !open && (
        <section
          className="cookie-banner"
          aria-labelledby="cookie-banner-title"
          aria-describedby="cookie-banner-description"
        >
          <div className="flex items-center justify-between gap-4">
            <h2 id="cookie-banner-title" className="text-sm font-bold">
              {t("consent.title")}
            </h2>
            {!consent && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="-my-2 -mr-2"
                onClick={() => choose(false)}
                aria-label={t("consent.closeReject")}
              >
                <XIcon />
              </Button>
            )}
          </div>
          <p
            id="cookie-banner-description"
            className="text-muted-foreground text-sm leading-6"
          >
            {t(consent && syncFailed ? "consent.syncError" : "consent.summary")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!consent ? (
              <>
                <Button
                  variant="outline"
                  className="min-w-0 flex-1 text-xs sm:flex-none sm:text-sm"
                  onClick={() => choose(false)}
                >
                  {t("consent.reject")}
                </Button>
                <Button
                  variant="outline"
                  className="min-w-0 flex-1 text-xs sm:flex-none sm:text-sm"
                  onClick={() => choose(true)}
                >
                  {t("consent.accept")}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  void syncSponsorConsent();
                }}
              >
                {t("consent.retry")}
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={showPreferences}
            >
              {t("consent.preferences")}
            </Button>
          </div>
          {policyLinks}
        </section>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
          closeLabel={t("consent.closePreferences")}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected)
              returnFocus.current.focus({ preventScroll: true });
            else
              document
                .querySelector<HTMLButtonElement>("[data-cookie-preferences]")
                ?.focus({ preventScroll: true });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("consent.preferences")}</DialogTitle>
            <DialogDescription>{t("consent.description")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>{t("consent.necessary")}</FieldLabel>
              <FieldDescription>
                {t("consent.necessaryDescription")}
              </FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <input
                id="consent-analytics"
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                aria-describedby="consent-analytics-description"
                className="accent-primary focus-visible:outline-ring mt-1 size-5 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4"
              />
              <FieldContent className="gap-2">
                <FieldLabel htmlFor="consent-analytics">
                  {t("consent.analytics")}
                </FieldLabel>
                <FieldDescription id="consent-analytics-description">
                  {t("consent.analyticsDescription")}
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
          <p className="text-muted-foreground text-xs leading-5">
            {t("consent.retention")}
          </p>
          {policyLinks}
          <DialogFooter>
            <Button variant="outline" onClick={() => choose(false)}>
              {t("consent.reject")}
            </Button>
            <Button variant="outline" onClick={() => choose(analytics)}>
              {t("consent.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
