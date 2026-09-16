import { describe, expect, it } from "vitest";
import {
  buildAllSidebarCards,
  getAvailableSpots,
  getMobileBottomSponsors,
  getMobileTopSponsors,
  getSponsorUrl,
  type SidebarCard,
  type Sponsor,
} from "@/lib/sponsors";

function makeSponsors(count: number): Sponsor[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `sponsor-${index + 1}`,
    name: `Sponsor ${index + 1}`,
    claim: "A sponsor",
    url: `https://example.com/${index + 1}`,
    icon: "✦",
  }));
}

function cardSponsors(cards: SidebarCard[]) {
  return cards.flatMap((card) => {
    if (card.type === "sponsor-single") return [card.sponsor.id];
    if (card.type === "sponsor-flip") return [card.front.id, card.back.id];
    return [];
  });
}

describe("sponsor placement", () => {
  it.each([0, 1, 3, 4, 5, 9, 10, 11, 12, 19, 20, 21, 25])(
    "shows each supported sponsor exactly once per device layout with %i entries",
    (count) => {
      const list = makeSponsors(count);
      const before = structuredClone(list);
      const { left, right } = buildAllSidebarCards(list);
      const expected = list.slice(0, 20).map((sponsor) => sponsor.id);
      expect([...cardSponsors(left), ...cardSponsors(right)].sort()).toEqual(
        [...expected].sort(),
      );
      expect(
        [...getMobileTopSponsors(list), ...getMobileBottomSponsors(list)].map(
          (sponsor) => sponsor.id,
        ),
      ).toEqual(expected);
      expect(left.length).toBeLessThanOrEqual(5);
      expect(right.length).toBeLessThanOrEqual(5);
      expect(getAvailableSpots(list)).toBe(Math.max(0, 20 - count));
      expect(list).toEqual(before);
    },
  );

  it("balances odd front counts and puts the invitation on the left", () => {
    const { left, right } = buildAllSidebarCards(makeSponsors(5));
    expect(cardSponsors(left)).toEqual(["sponsor-1", "sponsor-2", "sponsor-3"]);
    expect(cardSponsors(right)).toEqual(["sponsor-4", "sponsor-5"]);
    expect(left.at(-1)).toEqual({ type: "advertise" });
    expect(buildAllSidebarCards([]).left).toEqual([{ type: "advertise" }]);
  });

  it("adds backs alternately to both columns starting at sponsor 11", () => {
    const list = makeSponsors(14);
    const { left, right } = buildAllSidebarCards(list);
    expect(left[0]).toMatchObject({
      type: "sponsor-flip",
      front: list[0],
      back: list[10],
    });
    expect(right[0]).toMatchObject({
      type: "sponsor-flip",
      front: list[5],
      back: list[11],
    });
    expect(left[1]).toMatchObject({
      type: "sponsor-flip",
      front: list[1],
      back: list[12],
    });
    expect(right[1]).toMatchObject({
      type: "sponsor-flip",
      front: list[6],
      back: list[13],
    });
    expect(left[2].type).toBe("sponsor-single");
    expect(right[2].type).toBe("sponsor-single");
    expect([...left, ...right].some((card) => card.type === "advertise")).toBe(
      false,
    );
  });
});

describe("sponsor referral URLs", () => {
  it.each(["mobile_bar", "sponsor_card"] as const)(
    "preserves queries and anchors for %s",
    (campaign) => {
      const sponsor = {
        ...makeSponsors(1)[0],
        url: "https://example.com/offer?plan=annual&utm_source=old#pricing",
      };
      const result = new URL(getSponsorUrl(sponsor, campaign));
      expect(result.pathname).toBe("/offer");
      expect(result.searchParams.get("plan")).toBe("annual");
      expect(result.hash).toBe("#pricing");
      expect(result.searchParams.getAll("utm_source")).toEqual(["unmarker.it"]);
      expect(result.searchParams.get("utm_medium")).toBe("referral");
      expect(result.searchParams.get("utm_campaign")).toBe(campaign);
    },
  );
});
