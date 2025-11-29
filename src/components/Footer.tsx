import { usePostHog } from "posthog-js/react";
import ReactLogo from "@/assets/react.svg";
import ViteLogo from "@/assets/vite.svg";
import CanvasLogo from "@/assets/canvas.svg";

export function Footer() {
  const posthog = usePostHog();

  const handleGithubClick = () => {
    posthog?.capture("action_clicked", {
      action: "github_author",
      component: "footer",
    });
  };
  return (
    <footer className="mt-0 border-t-4 border-black pt-6 pb-4">
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
                className="flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-colors hover:bg-cyan-100 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <img src={ReactLogo} alt="React" className="h-5 w-5" />
                <span className="text-sm font-bold">React</span>
              </a>
              <a
                href="https://vite.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-colors hover:bg-purple-100 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <img src={ViteLogo} alt="Vite" className="h-5 w-5" />
                <span className="text-sm font-bold">Vite</span>
              </a>

              <a
                className="flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-colors hover:bg-yellow-100 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                href="https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={CanvasLogo} alt="Canvas" className="h-5 w-5" />
                <span className="text-sm font-bold">Canvas API</span>
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium tracking-wide">
              Crafted by
            </span>
            <a
              href="https://github.com/ing-norante/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleGithubClick}
              className="border-2 border-black bg-black px-3 py-1 text-sm font-black text-white transition-colors hover:bg-yellow-300 hover:text-black"
            >
              ing.norante
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
