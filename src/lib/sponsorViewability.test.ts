import { describe, expect, it } from "vitest";
import { SponsorViewability } from "@/lib/sponsorViewability";

function setup() {
  let sequence = 0;
  return new SponsorViewability(() => `impression-${++sequence}`);
}

function expose(ledger: SponsorViewability, key: string, start = 0) {
  const emitted = [];
  for (let time = start; time <= start + 1200; time += 200) {
    const id = ledger.sample(key, true, time);
    if (id) emitted.push(id);
  }
  return emitted;
}

describe("qualified sponsor impressions", () => {
  it("requires one continuous second and emits only once per placement", () => {
    const ledger = setup();
    for (let time = 0; time < 1000; time += 200)
      expect(ledger.sample("left:1", true, time)).toBeNull();
    expect(ledger.sample("left:1", true, 1000)).toBe("impression-1");
    expect(expose(ledger, "left:1", 1200)).toEqual([]);
  });

  it("does not combine short exposures separated by invisibility", () => {
    const ledger = setup();
    for (let time = 0; time < 1000; time += 200)
      ledger.sample("front", true, time);
    ledger.sample("front", false, 1000);
    expect(ledger.sample("front", true, 1200)).toBeNull();
    expect(ledger.sample("front", true, 1400)).toBeNull();
  });

  it("does not count a throttled timer as proof of sustained exposure", () => {
    const ledger = setup();
    ledger.sample("chip", true, 0);
    expect(ledger.sample("chip", true, 10000)).toBeNull();
    expect(expose(ledger, "chip", 10200)).toEqual(["impression-1"]);
  });

  it("resets continuity when a tab is hidden without recounting previous impressions", () => {
    const ledger = setup();
    expect(expose(ledger, "already-seen")).toEqual(["impression-1"]);
    ledger.sample("new", true, 1400);
    ledger.resetContinuity();
    expect(ledger.sample("new", true, 5000)).toBeNull();
    expect(expose(ledger, "already-seen", 5000)).toEqual([]);
  });

  it("deduplicates marquee copies and repeated animation cycles using the logical placement key", () => {
    const ledger = setup();
    expect(expose(ledger, "sponsor:mobile_top:1:chip")).toEqual([
      "impression-1",
    ]);
    ledger.sample("sponsor:mobile_top:1:chip", false, 1400);
    expect(expose(ledger, "sponsor:mobile_top:1:chip", 10000)).toEqual([]);
    expect(expose(ledger, "sponsor:mobile_bottom:1:chip", 10000)).toEqual([
      "impression-2",
    ]);
  });

  it("counts a new page view independently", () => {
    expect(expose(setup(), "front")).toEqual(["impression-1"]);
    expect(expose(setup(), "front")).toEqual(["impression-1"]);
  });
});

describe("sponsor click attribution", () => {
  it("records fast clicks without fabricating an impression", () => {
    const ledger = setup();
    expect(ledger.click("front")).toEqual({
      impressionId: null,
      firstClick: true,
      firstImpressionClick: false,
    });
    expect(expose(ledger, "front")).toEqual(["impression-1"]);
    expect(ledger.click("front")).toEqual({
      impressionId: "impression-1",
      firstClick: false,
      firstImpressionClick: true,
    });
  });

  it("attributes repeated clicks but includes only one in qualified CTR", () => {
    const ledger = setup();
    expose(ledger, "front");
    expect(ledger.click("front").firstImpressionClick).toBe(true);
    expect(ledger.click("front")).toEqual({
      impressionId: "impression-1",
      firstClick: false,
      firstImpressionClick: false,
    });
  });
});
