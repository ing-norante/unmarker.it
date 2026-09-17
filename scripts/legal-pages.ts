import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Marked } from "marked";

// Only repository-owned Markdown is rendered. Never pass user content here.
const markdown = new Marked();
const root = path.resolve(import.meta.dirname, "..");
export const legalPages = [
  {
    slug: "sponsorship-terms",
    file: "sponsor-terms.it.md",
    label: "Condizioni sponsor",
  },
  { slug: "privacy", file: "privacy.it.md", label: "Privacy" },
  { slug: "cookies", file: "cookies.it.md", label: "Cookie" },
  {
    slug: "cancellations-refunds",
    file: "sponsor-terms.it.md",
    label: "Cancellazioni e rimborsi",
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
    const version = source.match(/^> Versione .+$/m)?.[0];
    if (start < 0 || end <= start || !version)
      throw new Error("Missing refund clauses or terms version");
    const sections = source.slice(start, end);
    source = `# Cancellazioni e rimborsi\n\n${version}\n\nQuesta pagina riproduce gli articoli 6 e 7 delle [condizioni di vendita](/legal/sponsorship-terms). Per il contratto completo si applicano le condizioni di vendita.\n\n${sections}`;
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
<html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><meta name="color-scheme" content="dark"><title>${escape(title)} | Unmarker.it</title><link rel="canonical" href="https://www.unmarker.it/legal/${page.slug}">${stylesheets.map((url) => `<link rel="stylesheet" href="${escape(url)}">`).join("")}</head>
<body class="legal-page"><a class="legal-skip" href="#documento">Vai al documento</a><div class="legal-shell"><header class="legal-header"><a class="legal-brand" href="/">UNMARKER.IT</a><a href="/">Torna allo strumento</a></header><nav class="legal-nav" aria-label="Documenti legali">${navigation}</nav><main id="documento" class="legal-document">${content}</main><footer class="legal-footer"><p>NOMADE - S.R.L. · P. IVA / C.F. 07505480488</p><p>Via Luigi Salvatore Cherubini 10, 50121 Firenze (FI), Italia · Registro Imprese di Firenze 07505480488 · REA FI - 708292 · Capitale sociale 100.000,00 € i.v.</p><a href="mailto:help@nomadesrl.it">help@nomadesrl.it</a> · <a href="mailto:info@pec.nomadesrl.it">PEC</a><p><a href="/#cookie-preferences">Modifica le preferenze cookie</a></p><p>Puoi conservare il documento usando Stampa → Salva come PDF nel browser. Queste pagine non caricano analytics.</p></footer></div></body></html>`;
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
