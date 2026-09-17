import type { ReactNode } from "react";
import { openCookiePreferences } from "@/lib/cookieConsent";
import { legalDocuments } from "@/lib/legalDocuments";
import { GithubLogoIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { trackAction } from "@/lib/analytics";

const linkClassName =
  "inline-flex min-h-11 items-center gap-2 py-2 text-sm leading-6 text-muted-foreground underline-offset-4 hover:text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

const legalDrafts = [
  { label: "footer.terms", href: legalDocuments.terms },
  { label: "footer.privacy", href: legalDocuments.privacy },
  { label: "footer.cookies", href: legalDocuments.cookies },
  { label: "footer.refunds", href: legalDocuments.refunds },
] as const;

export function Footer() {
  const { t } = useTranslation("common");

  return (
    <footer className="bg-background shrink-0 border-t pt-10 pb-3 sm:pt-12">
      <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <p className="text-2xl font-black tracking-tight">UNMARKER.IT</p>
          <p className="text-muted-foreground mt-3 max-w-80 text-sm leading-6">
            {t("footer.description")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              href="https://github.com/ing-norante/unmarker.it"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction("github_repo_link", "footer")}
              className={linkClassName}
            >
              <GithubLogoIcon aria-hidden="true" className="size-5" />
              GitHub
            </a>
          </div>
        </div>

        <nav aria-label={t("footer.research")}>
          <h2 className="text-sm font-bold">{t("footer.research")}</h2>
          <ul className="mt-3">
            <li>
              <a
                href="https://arxiv.org/abs/2405.08363"
                target="_blank"
                rel="noopener noreferrer"
                title={t("footer.arxivTitle")}
                onClick={() => trackAction("research_arxiv_link", "footer")}
                className={linkClassName}
              >
                arXiv
              </a>
            </li>
            <li>
              <a
                href="https://uwaterloo.ca/news/media/watermarks-offer-no-defense-against-deepfakes"
                target="_blank"
                rel="noopener noreferrer"
                title={t("footer.waterlooTitle")}
                onClick={() => trackAction("research_waterloo_link", "footer")}
                className={linkClassName}
              >
                UWaterloo
              </a>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-bold">{t("footer.contact")}</h2>
          <ul className="mt-3">
            <li>
              <a className={linkClassName} href="mailto:help@nomadesrl.it">
                help@nomadesrl.it
              </a>
            </li>
            <li>
              <a
                className={linkClassName}
                href="mailto:info@pec.nomadesrl.it"
                aria-label={t("footer.pecLabel")}
              >
                <span className="break-all">info@pec.nomadesrl.it</span>
                <span className="shrink-0 text-xs">PEC</span>
              </a>
            </li>
          </ul>
        </div>

        <nav
          aria-labelledby="footer-legal-heading"
          aria-describedby="footer-legal-notice"
        >
          <h2 id="footer-legal-heading" className="text-sm font-bold">
            {t("footer.legal")}
          </h2>
          <ul className="mt-3">
            {legalDrafts.map(({ label, href }) => (
              <li key={label}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClassName}
                >
                  {t(label)}
                </a>
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-cookie-preferences
            className={linkClassName}
            onClick={openCookiePreferences}
          >
            {t("consent.preferences")}
          </button>
          <p
            id="footer-legal-notice"
            className="text-muted-foreground mt-3 text-xs leading-5"
          >
            <strong className="text-foreground">
              {t("footer.draftNotice")}
            </strong>{" "}
            {t("footer.draftDescription")}
          </p>
        </nav>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-3 gap-y-2 border-t py-1.5 text-xs leading-3 sm:grid-cols-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.55fr)_minmax(0,1.4fr)_minmax(0,1.15fr)_minmax(0,0.65fr)_minmax(0,1.2fr)]">
        <LegalField label="NOMADE - S.R.L." emphasize>
          © {new Date().getFullYear()}
        </LegalField>
        <LegalField label={t("footer.registeredOffice")}>
          <address className="not-italic">
            Via Luigi Salvatore Cherubini 10
            <br />
            50121 Firenze (FI), {t("footer.italy")}
          </address>
        </LegalField>
        <LegalField label={t("footer.vatTaxId")}>
          <span className="tabular-nums">07505480488</span>
        </LegalField>
        <LegalField label={t("footer.businessRegister")}>
          Firenze, 07505480488
        </LegalField>
        <LegalField label="REA">FI - 708292</LegalField>
        <LegalField label={t("footer.shareCapital")}>
          {t("footer.paidCapital")}
        </LegalField>
      </dl>
    </footer>
  );
}

function LegalField({
  label,
  children,
  emphasize = false,
}: {
  label: string;
  children: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt
        className={
          emphasize
            ? "text-foreground font-black tracking-tight"
            : "text-muted-foreground font-bold"
        }
      >
        {label}
      </dt>
      <dd className="text-muted-foreground mt-px">{children}</dd>
    </div>
  );
}
