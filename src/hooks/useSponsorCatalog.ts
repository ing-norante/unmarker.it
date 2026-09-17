import { useEffect, useState } from "react";
import {
  sponsors as houseSponsors,
  TOTAL_SPONSOR_SLOTS,
  type Sponsor,
} from "@/lib/sponsors";
import { setSponsorCount } from "@/lib/sponsorAnalyticsContext";

export interface SponsorCatalog {
  sponsors: Sponsor[];
  availableSpots: number;
  checkoutEnabled: boolean;
  testMode: boolean;
}

export function useSponsorCatalog(): SponsorCatalog {
  const [catalog, setCatalog] = useState<SponsorCatalog>({
    sponsors: houseSponsors,
    availableSpots: TOTAL_SPONSOR_SLOTS - houseSponsors.length,
    checkoutEnabled: false,
    testMode: false,
  });
  useEffect(() => {
    let stopped = false;
    let active: Sponsor[] = [];
    let abort: AbortController | undefined;
    const filterExpired = () => {
      const now = Date.now();
      const remaining = active.filter(
        (s) => !s.expiresAt || Date.parse(s.expiresAt) > now,
      );
      if (remaining.length === active.length) return;
      active = remaining;
      setSponsorCount(active.length + houseSponsors.length);
      setCatalog((previous) => ({
        ...previous,
        sponsors: [...houseSponsors, ...active],
      }));
    };
    const refresh = async () => {
      filterExpired();
      if (document.visibilityState !== "visible") return;
      abort?.abort();
      abort = new AbortController();
      try {
        const response = await fetch("/api/sponsors", {
          signal: abort.signal,
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (stopped || !Array.isArray(data.sponsors)) return;
        // Publication removals still apply while new purchases are disabled.
        active = (data.sponsors as Sponsor[]).filter(
          (s) =>
            s.kind === "paid" &&
            s.expiresAt &&
            Date.parse(s.expiresAt) > Date.now(),
        );
        const all = [...houseSponsors, ...active].slice(0, TOTAL_SPONSOR_SLOTS);
        setSponsorCount(all.length);
        setCatalog({
          sponsors: all,
          availableSpots:
            data.checkoutEnabled === true ? data.availableSpots : 0,
          checkoutEnabled: data.checkoutEnabled === true,
          testMode: data.testMode === true,
        });
      } catch {
        /* Existing cards remain until their own expiration during network failures. */
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 15_000);
    const expiryTimer = setInterval(filterExpired, 1000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("unmarker:sponsors-refresh", refresh);
    return () => {
      stopped = true;
      abort?.abort();
      clearInterval(timer);
      clearInterval(expiryTimer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("unmarker:sponsors-refresh", refresh);
    };
  }, []);
  return catalog;
}
