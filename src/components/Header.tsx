import { cn } from "@/lib/utils";

export function Header({ className }: { className?: string }) {
  return (
    <header
      className={cn("shrink-0 space-y-4 border-b pb-5 lg:space-y-5", className)}
    >
      <div className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
        Client-side image pipeline
      </div>
      <h1 className="font-heading text-4xl leading-[0.95] font-semibold text-balance sm:text-5xl">
        Unmarker.it
      </h1>
      <p className="text-muted-foreground max-w-[34rem] text-sm leading-6 sm:text-base">
        Shake off invisible AI watermarks.{" "}
        <span className="text-foreground font-medium">100% client-side.</span>{" "}
        Your image stays in your browser.
      </p>
    </header>
  );
}
