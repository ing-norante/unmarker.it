import { usePostHog } from "posthog-js/react";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  AtomIcon,
  FrameCornersIcon,
  LightningIcon,
} from "@phosphor-icons/react";

export function Footer() {
  const posthog = usePostHog();

  const handleFeatureBoardClick = () => {
    posthog?.capture("action_clicked", {
      action: "feature_board_link",
      component: "footer",
    });
  };

  const handleGithubClick = () => {
    posthog?.capture("action_clicked", {
      action: "github_repo_link",
      component: "footer",
    });
  };
  return (
    <footer className="bg-background shrink-0 border-t px-7 py-8">
      <div className="flex flex-col items-center justify-between gap-5 md:flex-row">
        <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
          <span className="text-muted-foreground text-sm font-semibold">
            Built with
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
              Feedback
            </a>
          </Button>
          <Separator orientation="vertical" className="h-8" />
          <span className="text-muted-foreground text-sm font-semibold">
            Crafted by
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
