import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { legalPages, renderLegalPage } from "./legal-pages";
import { legalDocuments } from "../src/lib/legalDocuments";
import { SPONSOR_TERMS_VERSION } from "../src/lib/sponsorBilling";

describe("published legal documents", () => {
  it("renders every linked policy without JavaScript and without indexing", async () => {
    for (const url of Object.values(legalDocuments)) {
      const html = await renderLegalPage(url.split("/").at(-1)!, [
        "/assets/site.css",
      ]);
      expect(html).toContain('<meta name="robots" content="noindex, follow">');
      expect(html).toContain('<html lang="it">');
      expect(html).toContain('href="/assets/site.css"');
      expect(html).not.toContain("<script");
      expect(html).not.toMatch(/BOZZA|DA COMPLETARE|DA VERIFICARE/);
      expect(html).toContain("18 settembre 2026");
    }
    expect(legalPages).toHaveLength(Object.keys(legalDocuments).length);
    expect(await renderLegalPage("unknown", [])).toBeNull();
  });

  it("uses the checkout terms version and the original refund clauses", async () => {
    const terms = await readFile("docs/legal/sponsor-terms.it.md", "utf8");
    expect(terms).toContain(`Versione ${SPONSOR_TERMS_VERSION}`);
    const full = await renderLegalPage("sponsorship-terms", []);
    const refunds = await renderLegalPage("cancellations-refunds", []);
    const clauses = full!.slice(
      full!.indexOf("<h2>6."),
      full!.indexOf("<h2>8."),
    );
    expect(clauses.length).toBeGreaterThan(1000);
    expect(refunds).toContain(clauses);
  });
});
