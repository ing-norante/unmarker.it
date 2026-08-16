import { describe, expect, it } from "vitest";
import { createI18n } from "@/i18n/createI18n";
import { createDocumentMetadata } from "@/i18n/documentMetadata";
import { prefersSimplifiedChinese, resolveLocaleFromPathname } from "@/i18n/locales";
import { resources } from "@/i18n/resources";

describe("locale resolution", () => {
  it.each([
    ["/", "en"],
    ["/zh-hans", "zh-Hans"],
    ["/zh-hans/", "zh-Hans"],
    ["/zh-Hans/", "zh-Hans"],
    ["/zh-hans-extra", "en"],
  ])("maps %s to %s", (pathname, locale) => {
    expect(resolveLocaleFromPathname(pathname)).toBe(locale);
  });

  it.each(["zh", "zh-CN", "zh-SG", "zh-Hans", "zh-Hans-CN"])(
    "recognizes Simplified Chinese locale %s",
    (locale) => expect(prefersSimplifiedChinese([locale])).toBe(true),
  );

  it.each(["zh-TW", "zh-HK", "zh-MO", "zh-Hant", "zh-Hant-HK"])(
    "excludes Traditional Chinese locale %s",
    (locale) => expect(prefersSimplifiedChinese([locale])).toBe(false),
  );
});

describe("translation resources", () => {
  it("keeps complete key and interpolation parity", () => {
    const en = flatten(resources.en);
    const zh = flatten(resources["zh-Hans"]);
    expect([...en.keys()].sort()).toEqual([...zh.keys()].sort());
    for (const [key, value] of en) {
      expect(interpolations(zh.get(key) ?? ""), key).toEqual(interpolations(value));
    }
  });

  it("keeps approved brands and technical terms unchanged", () => {
    const allChinese = [...flatten(resources["zh-Hans"]).values()].join("\n");
    for (const term of ["Unmarker.it", "Gemini", "OpenCV.js", "C2PA", "JPEG"]) {
      expect(allChinese).toContain(term);
    }
  });

  it("contains no denied English UI phrases", () => {
    const allChinese = [...flatten(resources["zh-Hans"]).values()].join("\n");
    for (const phrase of [
      "Drag an image", "WORKFLOW", "Needs attention", "Core facts",
      "Analyze, remove, and verify", "Built with", "No cleanup needed", "Failed",
    ]) expect(allChinese).not.toContain(phrase);
  });
});

describe("isolated SSR i18n instances", () => {
  it("renders metadata en → zh-Hans → en without language contamination", async () => {
    const firstEn = await createI18n("en");
    const zh = await createI18n("zh-Hans");
    const secondEn = await createI18n("en");
    expect(createDocumentMetadata(firstEn.language as "en", firstEn).title).toContain("AI Watermark Remover");
    expect(createDocumentMetadata("zh-Hans", zh).title).toContain("AI 水印");
    expect(createDocumentMetadata(secondEn.language as "en", secondEn).title).toBe(
      createDocumentMetadata("en", firstEn).title,
    );
    expect(firstEn).not.toBe(zh);
    expect(zh).not.toBe(secondEn);
  });

  it("renders en → zh-Hans → en without translated tree contamination", async () => {
    const { render } = await import("@/entry-server");
    const firstEn = await render("en");
    const zh = await render("zh-Hans");
    const secondEn = await render("en");
    expect(firstEn.appHtml).toContain("Drag an image");
    expect(zh.appHtml).toContain("拖入图片");
    expect(zh.appHtml).not.toContain("Drag an image");
    expect(secondEn.appHtml).toContain("Drag an image");
  });
});

function flatten(value: object, prefix = "", output = new Map<string, string>()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") output.set(path, child);
    else flatten(child, path, output);
  }
  return output;
}

function interpolations(value: string) {
  return [...value.matchAll(/{{\s*([^},\s]+).*?}}/g)].map((match) => match[1]).sort();
}
