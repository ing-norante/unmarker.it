import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createI18n } from "@/i18n/createI18n";
import type { SupportedLocale } from "@/i18n/locales";
import { ImageUploader } from "@/components/ImageUploader";
import { WorkflowSummary } from "@/components/WorkflowStatus";
import { Progress } from "@/components/ui/progress";
import { CrushQualityControl } from "@/components/CrushQualityControl";
import { VerificationDiff } from "@/components/VerificationDiff";
import { MetadataSignalsList } from "@/components/MetadataSignalsList";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { buildImageAudit } from "@/lib/imageAudit";

async function renderLocalized(children: ReactNode, locale: SupportedLocale) {
  const i18n = await createI18n(locale);
  return {
    i18n,
    html: renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>,
    ),
  };
}

describe("accessible progress", () => {
  it.each([0, 47, 100])("exposes the displayed value %s", (value) => {
    const html = renderToStaticMarkup(
      <Progress value={value} aria-label="Gemini Scan" />,
    );
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Gemini Scan"');
    expect(html).toContain(`aria-valuenow="${value}"`);
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain(`translateX(-${100 - value}%)`);
  });

  it("retains an indeterminate state when there is no measured value", () => {
    const html = renderToStaticMarkup(<Progress aria-label="Loading" />);
    expect(html).not.toContain("aria-valuenow");
    expect(html).toContain('data-state="indeterminate"');
  });

  it("supports a named meter for a static score", () => {
    const html = renderToStaticMarkup(
      <Progress role="meter" value={47} aria-label="AI provenance score" />,
    );
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="47"');
    expect(html).toContain('aria-label="AI provenance score"');
  });
});

describe.each(["en", "zh-Hans"] as const)(
  "%s workflow accessibility",
  (locale) => {
    it.each(["failed", "not-scanned"] as const)(
      "hides the evidence meter when the visible scan is %s",
      async (visibleScanStatus) => {
        const audit = buildImageAudit({
          stage: "preflight",
          metadataScan: {
            format: "jpeg",
            signals: [],
            warnings: [],
            hasAiMetadata: false,
          },
          visibleScan: { status: visibleScanStatus },
        });
        const { html, i18n } = await renderLocalized(
          <AnalysisPanel audit={audit} phase="analysis-only" />,
          locale,
        );
        expect(html).toContain(i18n.t("workflow:audit.score.incomplete.label"));
        expect(html).not.toContain('role="meter"');
        expect(html).not.toContain("12%");
        expect(html).not.toContain(
          i18n.t("workflow:audit.score.none.description"),
        );
      },
    );

    it.each(["preflight", "postflight"] as const)(
      "labels hidden watermark evidence as unverified after completion, including %s analysis",
      async (stage) => {
        const audit = buildImageAudit({
          stage,
          metadataScan: null,
          visibleScan: { status: "not-scanned" },
        });
        const { html, i18n } = await renderLocalized(
          <AnalysisPanel audit={audit} phase="complete" />,
          locale,
        );
        const badges = Array.from(
          html.matchAll(/<span[^>]+data-slot="badge"[^>]*>([^<]+)<\/span>/g),
          (match) => match[1],
        );
        expect(badges).toContain(
          i18n.t("workflow:verification.status.unverified"),
        );
        expect(badges).not.toContain(i18n.t("common:generic.pending"));
        expect(badges).not.toContain(i18n.t("common:generic.processed"));
        expect(html).toContain(
          i18n.t(
            `workflow:audit.hidden.${stage === "postflight" ? "neutralized" : "risk"}.description`,
          ),
        );
      },
    );

    it("distinguishes unavailable metadata from a scan with no signals", async () => {
      const { html, i18n } = await renderLocalized(
        <MetadataSignalsList scanResult={null} />,
        locale,
      );
      expect(html).toContain(i18n.t("metadata:panel.unavailable"));
      expect(html).not.toContain(i18n.t("metadata:panel.empty"));
    });

    it("names the focusable quality slider and describes its percentage", async () => {
      const { html, i18n } = await renderLocalized(
        <CrushQualityControl value={0.85} onChange={() => {}} />,
        locale,
      );
      const thumb = html.match(/<[^>]+role="slider"[^>]*>/)?.[0];
      expect(thumb).toBeTruthy();
      expect(thumb).toContain(
        `aria-label="${i18n.t("workflow:quality.aria")}"`,
      );
      expect(thumb).toContain('aria-valuetext="85%"');
      const descriptionId = thumb?.match(/aria-describedby="([^"]+)"/)?.[1];
      expect(descriptionId).toBeTruthy();
      expect(html).toContain(`id="${descriptionId}"`);
    });

    it.each(["failed", "not-scanned", "scanned"] as const)(
      "reports output check completeness when visible scanning is %s",
      async (visibleScanStatus) => {
        const scan = {
          format: "jpeg" as const,
          hasAiMetadata: false,
          signals: [],
          warnings: [],
        };
        const preflightAudit = buildImageAudit({
          stage: "preflight",
          metadataScan: scan,
          visibleScan: { status: "not-scanned" },
        });
        const postflightAudit = buildImageAudit({
          stage: "postflight",
          metadataScan: scan,
          visibleScan:
            visibleScanStatus === "scanned"
              ? {
                  status: "scanned",
                  detection: {
                    detected: false,
                    confidence: 0,
                    region: { x: 0, y: 0, width: 48, height: 48 },
                    spatialScore: 0,
                    gradientScore: 0,
                    varianceScore: 0,
                  },
                }
              : { status: visibleScanStatus },
        });
        const { html, i18n } = await renderLocalized(
          <VerificationDiff
            preflightAudit={preflightAudit}
            postflightAudit={postflightAudit}
            warnings={[]}
          />,
          locale,
        );
        const badge = html.match(
          /<span[^>]+data-slot="badge"[^>]*>([^<]+)<\/span>/,
        )?.[1];
        expect(badge).toBe(
          i18n.t(
            `workflow:verification.${visibleScanStatus === "scanned" ? "verified" : "partial"}`,
          ),
        );
      },
    );

    it("exposes one named image-selection action with associated instructions", async () => {
      const { html, i18n } = await renderLocalized(
        <ImageUploader onImagesSelect={() => {}} />,
        locale,
      );
      expect(html.match(/<button\b/g)).toHaveLength(1);
      expect(html).toMatch(/<input\b[^>]*multiple=""/);
      expect(html).not.toContain('role="button"');
      expect(html).toContain(
        `aria-label="${i18n.t("common:actions.chooseImage")}"`,
      );
      const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1];
      expect(descriptionId).toBeTruthy();
      expect(html).toContain(`id="${descriptionId}"`);
      expect(html).not.toContain('tabindex="0"');
    });

    it("disables both the image-selection action and its file input", async () => {
      const { html } = await renderLocalized(
        <ImageUploader disabled onImagesSelect={() => {}} />,
        locale,
      );
      expect(html).toMatch(/<button\b[^>]*disabled=""/);
      expect(html).toMatch(/<input\b[^>]*disabled=""/);
    });

    it.each([
      { hasWarnings: false, verificationFailed: false, key: "description" },
      { hasWarnings: true, verificationFailed: false, key: "withWarnings" },
      {
        hasWarnings: true,
        verificationFailed: true,
        key: "verificationUnavailable",
      },
    ] as const)(
      "announces the final $key outcome",
      async ({ key, ...props }) => {
        const { html, i18n } = await renderLocalized(
          <WorkflowSummary phase="complete" {...props} />,
          locale,
        );
        expect(html).toContain('role="status"');
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain('aria-atomic="true"');
        expect(html).toContain(i18n.t(`workflow:phase.complete.${key}`));
        if (key !== "description") {
          expect(html).not.toContain(
            i18n.t("workflow:phase.complete.description"),
          );
        }
      },
    );
  },
);
