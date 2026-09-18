import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sponsorBookingSchema,
  sponsorIconSchema,
  validateSponsorIcon,
  sponsorFieldErrors,
} from "./sponsorFormValidation";
import { createI18n } from "@/i18n/createI18n";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("sponsor creative validation", () => {
  it("enforces the same public creative limits and file restrictions before checkout", () => {
    const icon = new File(["image"], "icon.png", { type: "image/png" });
    const creative = {
      name: "Example",
      mobileShowUrl: false,
      url: "https://example.com",
      description: "A short description.",
      icon,
    };
    expect(sponsorBookingSchema.safeParse(creative).success).toBe(true);
    expect(
      sponsorBookingSchema.safeParse({
        ...creative,
        url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      sponsorBookingSchema.safeParse({
        ...creative,
        description: "a".repeat(91),
      }).success,
    ).toBe(false);
    expect(sponsorIconSchema.safeParse(null).success).toBe(false);
    expect(
      sponsorIconSchema.safeParse(
        new File(["<svg/>"], "icon.svg", { type: "image/svg+xml" }),
      ).success,
    ).toBe(false);
    expect(
      sponsorIconSchema.safeParse(
        new File([new Uint8Array(256 * 1024 + 1)], "large.png", {
          type: "image/png",
        }),
      ).success,
    ).toBe(false);
  });
  it.each([
    [1024, false, undefined],
    [1025, false, "icon_dimensions"],
    [32, true, "icon_decode"],
  ])(
    "checks decoded pixels and releases the temporary URL (%s, corrupt: %s)",
    async (width, corrupt, message) => {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:icon");
      const revoke = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});
      vi.stubGlobal(
        "Image",
        class {
          naturalWidth = width;
          naturalHeight = 32;
          onload?: () => void;
          onerror?: () => void;
          set src(_url: string) {
            queueMicrotask(() =>
              corrupt ? this.onerror?.() : this.onload?.(),
            );
          }
        },
      );
      const file = new File(["image"], "icon.png", { type: "image/png" });
      expect(await validateSponsorIcon(file)).toEqual(
        message ? { message } : undefined,
      );
      expect(revoke).toHaveBeenCalledWith("blob:icon");
    },
  );
  it("translates one actionable error per field in either language", async () => {
    for (const locale of ["en", "zh-Hans"] as const) {
      const i18n = await createI18n(locale);
      const t = i18n.getFixedT(locale, "common");
      const errors = sponsorFieldErrors(
        [{ message: "required" }, { message: "italian_vat" }],
        t,
      );
      expect(errors).toEqual([{ message: t("sponsors.validation.required") }]);
      expect(errors[0].message).not.toContain("sponsors.validation");
    }
  });
});
