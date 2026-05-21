import { usePostHog } from "posthog-js/react";
import ReactLogo from "@/assets/react.svg";
import ViteLogo from "@/assets/vite.svg";
import CanvasLogo from "@/assets/canvas.svg";
import { ThemeToggle } from "./ThemeToggle";

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
    <footer className="bg-background/95 shrink-0 border-t px-4 py-4 lg:px-6">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
            <span className="text-muted-foreground text-sm">Built with</span>
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <a
                href="https://react.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-muted flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors"
              >
                <img src={ReactLogo} alt="React" className="h-5 w-5" />
                <span>React</span>
              </a>
              <a
                href="https://vite.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-muted flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors"
              >
                <img src={ViteLogo} alt="Vite" className="h-5 w-5" />
                <span>Vite</span>
              </a>

              <a
                className="hover:bg-muted flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors"
                href="https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={CanvasLogo}
                  alt="Canvas"
                  className="h-5 w-5 dark:invert"
                />
                <span>Canvas API</span>
              </a>
              <ThemeToggle />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a
              href="https://insigh.to/b/unmarkerit"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleFeatureBoardClick}
              className="hover:bg-muted rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors"
            >
              Feedback
            </a>
            <span className="text-muted-foreground text-sm">Crafted by</span>
            <a
              href="https://github.com/ing-norante/unmarker.it"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleGithubClick}
              className="hover:bg-muted rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors"
            >
              ing.norante
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
