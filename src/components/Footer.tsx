import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  AtomIcon,
  BookOpenIcon,
  FrameCornersIcon,
  LightningIcon,
  NewspaperIcon,
} from "@phosphor-icons/react";
import { trackAction } from "@/lib/analytics";
import { useTranslation } from "react-i18next";

export function Footer() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="theme"
    >
      <TooltipProvider>
        <FooterContent />
      </TooltipProvider>
    </ThemeProvider>
  );
}

function FooterContent() {
  const { t } = useTranslation("common");
  const handleFeatureBoardClick = () => {
    trackAction("feature_board_link", "footer");
  };

  const handleGithubClick = () => {
    trackAction("github_repo_link", "footer");
  };

  const handleArxivClick = () => {
    trackAction("research_arxiv_link", "footer");
  };

  const handleWaterlooClick = () => {
    trackAction("research_waterloo_link", "footer");
  };

  return (
    <footer className="bg-background shrink-0 border-t py-8">
      <div className="flex flex-col items-center justify-between gap-5 md:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
          <span className="text-muted-foreground text-sm font-semibold sm:text-base">
            {t("footer.builtWith")}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <Button asChild variant="outline" className="h-10">
              <a
                href="https://react.dev"
                target="_blank"
                rel="noopener noreferrer"
              >
                <AtomIcon data-icon="inline-start" />
                React
              </a>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <a
                href="https://vite.dev"
                target="_blank"
                rel="noopener noreferrer"
              >
                <LightningIcon data-icon="inline-start" />
                Vite
              </a>
            </Button>

            <Button asChild variant="outline" className="h-10">
              <a
                href="https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FrameCornersIcon data-icon="inline-start" />
                Canvas API
              </a>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <a
                href="https://arxiv.org/abs/2405.08363"
                target="_blank"
                rel="noopener noreferrer"
                title={t("footer.arxivTitle")}
                onClick={handleArxivClick}
              >
                <BookOpenIcon data-icon="inline-start" />
                arXiv
              </a>
            </Button>
            <Button asChild variant="outline" className="h-10">
              <a
                href="https://uwaterloo.ca/news/media/watermarks-offer-no-defense-against-deepfakes"
                target="_blank"
                rel="noopener noreferrer"
                title={t("footer.waterlooTitle")}
                onClick={handleWaterlooClick}
              >
                <NewspaperIcon data-icon="inline-start" />
                UWaterloo
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button asChild className="h-10 px-5 font-black">
            <a
              href="https://insigh.to/b/unmarkerit"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleFeatureBoardClick}
            >
              {t("footer.feedback")}
            </a>
          </Button>
          <Separator orientation="vertical" className="h-8" />
          <span className="text-muted-foreground text-sm font-semibold sm:text-base">
            {t("footer.craftedBy")}
          </span>
          <Button asChild variant="secondary" className="h-10 px-5 font-black">
            <a
              href="https://github.com/ing-norante/unmarker.it"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleGithubClick}
            >
              ing.norante
            </a>
          </Button>
        </div>
      </div>
    </footer>
  );
}
