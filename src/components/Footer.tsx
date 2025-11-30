import { usePostHog } from "posthog-js/react";
import ReactLogo from "@/assets/react.svg";
import ViteLogo from "@/assets/vite.svg";
import CanvasLogo from "@/assets/canvas.svg";
import { ThemeToggle } from "./ThemeToggle";

export function Footer() {
  const posthog = usePostHog();

  const handleGithubClick = () => {
    posthog?.capture("action_clicked", {
      action: "github_repo_link",
      component: "footer",
    });
  };
  return (
    <footer className="border-foreground bg-background mt-0 border-t-4 pt-6 pb-4">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-6 md:justify-start">
            <span className="text-sm font-medium tracking-wide">
              Built with
            </span>
            <div className="flex flex-wrap items-center justify-center gap-4 md:justify-start">
              <a
                href="https://react.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="border-foreground bg-background flex items-center gap-2 border-2 px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(var(--neo-shadow),1)] transition-colors hover:bg-cyan-100 hover:shadow-[4px_4px_0px_0px_rgba(var(--neo-shadow),1)] dark:hover:bg-cyan-900"
              >
                <img src={ReactLogo} alt="React" className="h-5 w-5" />
                <span className="text-sm font-bold">React</span>
              </a>
              <a
                href="https://vite.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="border-foreground bg-background flex items-center gap-2 border-2 px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(var(--neo-shadow),1)] transition-colors hover:bg-purple-100 hover:shadow-[4px_4px_0px_0px_rgba(var(--neo-shadow),1)] dark:hover:bg-purple-900"
              >
                <img src={ViteLogo} alt="Vite" className="h-5 w-5" />
                <span className="text-sm font-bold">Vite</span>
              </a>

              <a
                className="border-foreground bg-background flex items-center gap-2 border-2 px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(var(--neo-shadow),1)] transition-colors hover:bg-yellow-100 hover:shadow-[4px_4px_0px_0px_rgba(var(--neo-shadow),1)] dark:hover:bg-yellow-900"
                href="https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={CanvasLogo}
                  alt="Canvas"
                  className="h-5 w-5 dark:invert"
                />
                <span className="text-sm font-bold">Canvas API</span>
              </a>
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium tracking-wide">
              Crafted by
            </span>
            <a
              href="https://github.com/ing-norante/unmarker.it"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleGithubClick}
              className="border-foreground bg-foreground text-background hover:text-foreground border-2 px-3 py-1 text-sm font-black transition-colors hover:bg-yellow-300 dark:hover:bg-yellow-400 dark:hover:text-black"
            >
              ing.norante
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
