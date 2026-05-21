import { cn } from "@/lib/utils";

export function Header({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "bg-background shrink-0 space-y-3 lg:border-foreground/10 lg:border-b lg:pb-5 lg:space-y-4",
        className,
      )}
    >
      <h1 className="border-foreground border-b-4 pb-1 text-5xl font-black tracking-tighter uppercase sm:text-6xl lg:border-b-8 lg:pb-2">
        Unmarker
        <br />
        It
      </h1>
      <p className="border-foreground border-l-4 pl-3 text-base leading-relaxed font-medium sm:pl-4 sm:text-lg lg:text-xl">
        Shake off invisible AI watermarks.{" "}
        <span className="bg-yellow-300 px-1 font-bold text-black dark:bg-yellow-400">
          100% client-side.
        </span>{" "}
        Your image stays in your browser.
      </p>
    </header>
  );
}
