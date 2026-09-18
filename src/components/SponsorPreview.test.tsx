import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MobileSponsorChip } from "./MobileSponsorChip";
import { SponsorSingleCard } from "./SponsorSingleCard";
import { getMobileSponsorLabel } from "@/lib/sponsors";
import { sponsorCreativeSchema } from "@/lib/sponsorPurchase";

const sponsor = {
  id: "example",
  name: "Example project",
  claim: "A useful project for creators.",
  url: "https://www.example.com/landing?private=value#section",
  icon: "blob:http://localhost/preview-icon",
};

describe("sponsor previews and mobile labels", () => {
  it("defaults to the name and extracts only the hostname when requested", () => {
    expect(getMobileSponsorLabel(sponsor)).toBe(sponsor.name);
    expect(getMobileSponsorLabel({ ...sponsor, mobileShowUrl: true })).toBe(
      "www.example.com",
    );
    expect(
      getMobileSponsorLabel({
        ...sponsor,
        mobileShowUrl: true,
        url: "https://",
      }),
    ).toBe(sponsor.name);
    const creative = { ...sponsor, description: sponsor.claim };
    expect(sponsorCreativeSchema.parse(creative).mobileShowUrl).toBe(false);
    expect(
      sponsorCreativeSchema.safeParse({ ...creative, mobileShowUrl: "false" })
        .success,
    ).toBe(false);
  });
  it("renders both previews without links or impression tracking, including incomplete URLs", () => {
    for (const Component of [SponsorSingleCard, MobileSponsorChip]) {
      const html = renderToStaticMarkup(
        <Component sponsor={{ ...sponsor, url: "https://" }} preview />,
      );
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("data-sponsor-");
      expect(html).toContain('src="blob:http://localhost/preview-icon"');
    }
  });
  it("uses the same label for published chips while retaining tracked destination links", () => {
    const html = renderToStaticMarkup(
      <MobileSponsorChip
        sponsor={{ ...sponsor, mobileShowUrl: true }}
        placement={{ location: "mobile_top", position: 1, face: "chip" }}
      />,
    );
    expect(html).toContain("<span>www.example.com</span>");
    expect(html).toContain('data-sponsor-id="example"');
    expect(html).toContain("utm_campaign=mobile_bar");
    expect(html).toContain("private=value");
    expect(html).toContain('rel="sponsored noopener noreferrer"');
    const desktop = renderToStaticMarkup(
      <SponsorSingleCard
        sponsor={{ ...sponsor, mobileShowUrl: true }}
        preview
      />,
    );
    expect(desktop).toContain(sponsor.name);
  });
});
