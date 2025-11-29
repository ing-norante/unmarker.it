import ReactLogo from "@/assets/react.svg";
import ViteLogo from "@/assets/vite.svg";
import CanvasLogo from "@/assets/canvas.svg";

export function Footer() {
  return (
    <footer className="mt-12 border-t-4 border-black pt-6 pb-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Built with
            </span>
            <div className="flex items-center gap-4 flex-wrap justify-center md:justify-start">
              <a
                href="https://react.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 border-2 border-black bg-white hover:bg-cyan-100 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <img src={ReactLogo} alt="React" className="w-5 h-5" />
                <span className="font-bold text-sm">React</span>
              </a>
              <a
                href="https://vite.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 border-2 border-black bg-white hover:bg-purple-100 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <img src={ViteLogo} alt="Vite" className="w-5 h-5" />
                <span className="font-bold text-sm">Vite</span>
              </a>

              <a
                className="flex items-center gap-2 px-3 py-1.5 border-2 border-black bg-white hover:bg-yellow-100 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                href="https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={CanvasLogo} alt="Canvas" className="w-5 h-5" />
                <span className="font-bold text-sm">Canvas API</span>
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Crafted by</span>
            <a
              href="https://github.com/ing-norante/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-black text-sm bg-black text-white px-3 py-1 hover:bg-yellow-300 hover:text-black transition-colors border-2 border-black"
            >
              ing.norante
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
