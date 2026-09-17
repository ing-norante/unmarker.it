import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Marked } from "marked";

// Only repository-owned Markdown is rendered. Never pass user content here.
const markdown = new Marked();
const root = path.resolve(import.meta.dirname, "..");
export const legalPages = [
  {
    slug: "sponsorship-terms",
    file: "sponsor-terms.en.md",
    label: "Sponsorship terms",
  },
  { slug: "privacy", file: "privacy.en.md", label: "Privacy policy" },
  { slug: "cookies", file: "cookies.en.md", label: "Cookie policy" },
  {
    slug: "cancellations-refunds",
    file: "sponsor-terms.en.md",
    label: "Cancellations and refunds",
  },
] as const;

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export async function renderLegalPage(slug: string, stylesheets: string[]) {
  const page = legalPages.find((page) => page.slug === slug);
  if (!page) return null;
  let source = await readFile(path.join(root, "docs/legal", page.file), "utf8");
  if (slug === "cancellations-refunds") {
    const start = source.indexOf("## 6.");
    const end = source.indexOf("## 8.");
    const version = source.match(/^> Version .+$/m)?.[0];
    if (start < 0 || end <= start || !version)
      throw new Error("Missing refund clauses or terms version");
    const sections = source.slice(start, end);
    source = `# Cancellations and refunds\n\n${version}\n\nThis page reproduces clauses 6 and 7 of the [Sponsorship Terms of Sale](/legal/sponsorship-terms). The full terms govern the contract.\n\n${sections}`;
  }
  const title = source.split("\n")[0].replace(/^# /, "");
  const content = await markdown.parse(source);
  const navigation = legalPages
    .map(
      (item) =>
        `<a href="/legal/${item.slug}"${item.slug === slug ? ' aria-current="page"' : ""}>${item.label}</a>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><meta name="color-scheme" content="dark"><title>${escape(title)} | Unmarker.it</title><link rel="canonical" href="https://www.unmarker.it/legal/${page.slug}">${stylesheets.map((url) => `<link rel="stylesheet" href="${escape(url)}">`).join("")}</head>
<body class="legal-page"><a class="legal-skip" href="#documento">Skip to document</a><div class="legal-shell"><header class="legal-header"><a class="legal-brand" href="/">UNMARKER.IT</a><a href="/">Back to the tool</a></header><nav class="legal-nav" aria-label="Legal documents">${navigation}</nav><main id="documento" class="legal-document">${content}</main><footer class="legal-footer"><p>NOMADE - S.R.L. · VAT / Tax ID 07505480488</p><p>Via Luigi Salvatore Cherubini 10, 50121 Florence (FI), Italy · Florence Business Register 07505480488 · REA FI - 708292 · Share capital €100,000.00, fully paid</p><a href="mailto:help@nomadesrl.it">help@nomadesrl.it</a> · <a href="mailto:info@pec.nomadesrl.it">Certified email (PEC)</a><p><a href="/#cookie-preferences">Change cookie preferences</a></p><p>You can keep a copy using your browser’s Print → Save as PDF command. These pages do not load analytics.</p></footer></div></body></html>`;
}

export async function writeLegalPages(dist: string, template: string) {
  const stylesheets = Array.from(
    template.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g),
  )
    .map((match) => /href="([^"]+)"/.exec(match[0])?.[1])
    .filter((url): url is string => Boolean(url));
  if (!stylesheets.length)
    throw new Error("Missing compiled styles for legal pages");
  for (const page of legalPages) {
    const html = await renderLegalPage(page.slug, stylesheets);
    const directory = path.join(dist, "legal", page.slug);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "index.html"), html!);
  }
}
