export interface Sponsor {
  id: string;
  name: string;
  claim: string;
  url: string;
  /** URL of an icon, or an emoji. */
  icon: string;
  /** House ads are owned projects; paid placements can be reported separately. */
  kind?: "house" | "paid";
  /** ISO timestamp for server-managed paid campaigns. */
  expiresAt?: string;
}

/** House ads. Paid campaigns come from the server catalog. */
export const sponsors: Sponsor[] = [
  {
    id: "mycodosing",
    kind: "house",
    name: "Mycodosing.WTF",
    claim: "The Anti-Bullshit Psychedelic Calculator",
    url: "https://mycodosing.wtf",
    icon: "/sponsors/mycodosing.ico",
  },
  {
    id: "stickering.com",
    kind: "house",
    name: "Stickering.com",
    claim: "Discover and collect street stickers around the world.",
    url: "https://stickering.com",
    icon: "/sponsors/stickering.ico",
  },
  {
    id: "sloliday",
    kind: "house",
    name: "Sloliday.com",
    claim: "The smart planner that optimizes your vacation.",
    url: "https://www.sloliday.com/en",
    icon: "/sponsors/sloliday.ico",
  },
];

export const TOTAL_SPONSOR_SLOTS = 20;
const FRONT_SLOTS = TOTAL_SPONSOR_SLOTS / 2;
const CARDS_PER_SIDEBAR = FRONT_SLOTS / 2;

export const sponsorship: {
  priceEur: number;
  durationDays: number;
} = {
  priceEur: 500,
  durationDays: 30,
};

export type SidebarCard =
  | { type: "sponsor-flip"; front: Sponsor; back: Sponsor; delayMs: number }
  | { type: "sponsor-single"; sponsor: Sponsor }
  | { type: "advertise" };

/** Balanced fronts, then alternating left/right backs starting at sponsor 11. */
export function buildAllSidebarCards(sponsorList: readonly Sponsor[]): {
  left: SidebarCard[];
  right: SidebarCard[];
} {
  const visible = sponsorList.slice(0, TOTAL_SPONSOR_SLOTS);
  const frontCount = Math.min(visible.length, FRONT_SLOTS);
  const leftCount = Math.ceil(frontCount / 2);

  const buildColumn = (fronts: Sponsor[], side: 0 | 1): SidebarCard[] =>
    fronts.map((front, index) => {
      const back = visible[FRONT_SLOTS + index * 2 + side];
      return back
        ? {
            type: "sponsor-flip",
            front,
            back,
            delayMs: index * 500 + (side === 0 ? 500 : 0),
          }
        : { type: "sponsor-single", sponsor: front };
    });

  const left = buildColumn(visible.slice(0, leftCount), 0);
  const right = buildColumn(visible.slice(leftCount, frontCount), 1);

  // Keep the invitation available even before the first sponsor is added.
  if (left.length < CARDS_PER_SIDEBAR) left.push({ type: "advertise" });
  return { left, right };
}

export function getAvailableSpots(sponsorList: readonly Sponsor[]): number {
  return Math.max(0, TOTAL_SPONSOR_SLOTS - sponsorList.length);
}

export function getMobileTopSponsors(
  sponsorList: readonly Sponsor[],
): Sponsor[] {
  return sponsorList.slice(0, FRONT_SLOTS);
}

export function getMobileBottomSponsors(
  sponsorList: readonly Sponsor[],
): Sponsor[] {
  return sponsorList.slice(FRONT_SLOTS, TOTAL_SPONSOR_SLOTS);
}

/** Preserve existing query parameters and fragments when adding attribution. */
export function getSponsorUrl(
  sponsor: Sponsor,
  campaign: "mobile_bar" | "sponsor_card",
) {
  const url = new URL(sponsor.url);
  url.searchParams.set("utm_source", "unmarker.it");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}
