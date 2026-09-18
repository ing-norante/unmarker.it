import { sponsors, TOTAL_SPONSOR_SLOTS } from "@/lib/sponsors";

export const SPONSOR_LAYOUT_VERSION = "sponsors_v1";
let sponsorSeen = false;
let sponsorCount = Math.min(sponsors.length, TOTAL_SPONSOR_SLOTS);

export function setSponsorCount(count: number) {
  sponsorCount = Math.min(count, TOTAL_SPONSOR_SLOTS);
}

export function markSponsorSeen() {
  sponsorSeen = true;
}

export function resetSponsorSeen() {
  sponsorSeen = false;
}

export function getSponsorAnalyticsContext() {
  return {
    sponsor_layout_version: SPONSOR_LAYOUT_VERSION,
    sponsor_count: sponsorCount,
    sponsor_seen_before_event: sponsorSeen,
  };
}
