import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getSponsorPurchase, cancelSponsorPurchase } from "@/lib/sponsorApi";
import type { SponsorPurchaseStatus } from "@/lib/sponsorPurchase";

export function SponsorPurchaseReturn() {
  const { t, i18n } = useTranslation("common");
  const [id, setId] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<SponsorPurchaseStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(
      "sponsor_purchase",
    );
    if (value && /^[a-f0-9-]{36}$/.test(value)) {
      // Read only after hydration to keep SSR markup consistent.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setId(value);
    }
  }, []);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    let polls = 0;
    const check = async () => {
      try {
        const result = await getSponsorPurchase(id);
        if (cancelled) return;
        setPurchase(result);
        setError(null);
        window.dispatchEvent(new Event("unmarker:sponsors-refresh"));
        if (["pending", "creating"].includes(result.status) && ++polls < 12)
          timeout = setTimeout(check, 5000);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "temporary_error");
      }
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [id, attempt]);
  const close = () => {
    setId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("sponsor_purchase");
    url.searchParams.delete("sponsor_cancelled");
    window.history.replaceState(null, "", url);
  };
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <Dialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent closeLabel={t("sponsors.close")}>
        <DialogHeader>
          <DialogTitle>
            {t(
              purchase?.status === "active"
                ? "sponsors.paymentSuccess"
                : "sponsors.purchaseTitle",
            )}
          </DialogTitle>
          <DialogDescription>
            {purchase?.name || t("sponsors.checkingPayment")}
          </DialogDescription>
        </DialogHeader>
        {!purchase && !error && <Spinner />}
        {purchase && (
          <div className="flex flex-col gap-3">
            <p>{t(`sponsors.purchaseStatus.${purchase.status}`)}</p>
            {purchase.startsAt && purchase.expiresAt && (
              <p className="text-muted-foreground text-sm">
                {t("sponsors.campaignDates", {
                  start: date(purchase.startsAt),
                  end: date(purchase.expiresAt),
                })}
              </p>
            )}
            {purchase.checkoutUrl && (
              <>
                <Button asChild>
                  <a href={purchase.checkoutUrl}>
                    {t("sponsors.resumeCheckout")}
                  </a>
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result = await cancelSponsorPurchase(purchase.id);
                      setPurchase(result);
                      window.dispatchEvent(
                        new Event("unmarker:sponsors-refresh"),
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "temporary_error",
                      );
                    }
                  }}
                >
                  {t("sponsors.cancelCheckout")}
                </Button>
              </>
            )}
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {t(`sponsors.errors.${error}`, {
                defaultValue: t("sponsors.errors.temporary_error"),
              })}
            </AlertDescription>
          </Alert>
        )}
        {(error ||
          purchase?.status === "pending" ||
          purchase?.status === "creating" ||
          purchase?.status === "attention") && (
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            {t("sponsors.checkAgain")}
          </Button>
        )}
        <Button variant="secondary" onClick={close}>
          {t("sponsors.close")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
