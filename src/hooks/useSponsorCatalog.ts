import { useCallback, useEffect, useRef, useState } from "react";
import {
  sponsors as houseSponsors,
  TOTAL_SPONSOR_SLOTS,
  type Sponsor,
} from "@/lib/sponsors";
import { fetchSponsorCatalog } from "@/lib/sponsorCatalog";
import { setSponsorCount } from "@/lib/sponsorAnalyticsContext";

export interface SponsorCatalog {
  sponsors: Sponsor[];
  availableSpots?: number;
  status: "loading" | "ready" | "error";
  refreshing: boolean;
  checkoutEnabled: boolean;
  testMode: boolean;
}

export function useSponsorCatalog() {
  const refreshRef = useRef<() => void>(() => {});
  const retry = useCallback(() => refreshRef.current(), []);
  const [catalog, setCatalog] = useState<SponsorCatalog>({
    sponsors: houseSponsors,
    status: "loading",
    refreshing: true,
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
      if (abort) return; // Coalesce polling, visibility changes and repeated retries.
      abort = new AbortController();
      setCatalog((previous) => ({ ...previous, refreshing: true }));
      try {
        const data = await fetchSponsorCatalog(abort.signal);
        if (stopped) return;
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
          availableSpots: data.availableSpots,
          status: "ready",
          refreshing: false,
          checkoutEnabled: data.checkoutEnabled === true,
          testMode: data.testMode === true,
        });
      } catch {
        // Keep published cards until expiry, but never present stale capacity as current.
        if (!stopped)
          setCatalog((previous) => ({
            ...previous,
            availableSpots: undefined,
            checkoutEnabled: false,
            status: "error",
            refreshing: false,
          }));
      } finally {
        abort = undefined;
      }
    };
    refreshRef.current = () => {
      void refresh();
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
      refreshRef.current = () => {};
      abort?.abort();
      clearInterval(timer);
      clearInterval(expiryTimer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("unmarker:sponsors-refresh", refresh);
    };
  }, []);
  return { ...catalog, retry };
}
