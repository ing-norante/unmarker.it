import { cn } from "@/lib/utils";
import {
  LightningIcon,
  LockKeyIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";

export function Header({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "relative flex shrink-0 flex-col gap-5 pb-1 2xl:gap-7",
        className,
      )}
    >
      <div className="relative flex flex-col gap-3 2xl:gap-5">
        {/* <Sparkles className="fill-primary text-primary absolute top-0 right-10 size-5 sm:right-16" /> */}
        <h1 className="wide-hero-title text-foreground text-5xl leading-none font-black tracking-normal wrap-break-word sm:text-6xl lg:text-7xl xl:text-[5rem] 2xl:text-8xl">
          <span className="block uppercase xl:whitespace-nowrap">
            Unmarker.it
          </span>
          <span className="text-primary block text-2xl leading-tight font-black sm:text-3xl lg:text-4xl xl:text-5xl 2xl:text-6xl">
            AI Watermark Remover
          </span>
        </h1>
        <p className="text-muted-foreground text-xl leading-tight font-bold sm:text-2xl xl:text-3xl 2xl:text-4xl">
          Analyze, remove, and verify AI watermarks.
          <br />
          <span className="text-primary">100% client-side.</span>{" "}
          <span className="text-muted-foreground">
            Your image stays in your browser.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:gap-4 2xl:gap-5">
        <Feature icon={ShieldCheckIcon} title="100% Private" />
        <Feature icon={LightningIcon} title="Blazing Fast" />
        <Feature icon={LockKeyIcon} title="No Uploads" />
      </div>
    </header>
  );
}

function Feature({
  icon: Icon,
  title,
}: {
  icon: typeof ShieldCheckIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon
        className="text-foreground size-5 shrink-0 2xl:size-6"
        weight="bold"
      />
      <div className="min-w-0">
        <div className="text-foreground text-sm leading-tight font-extrabold sm:text-base 2xl:text-lg">
          {title}
        </div>
      </div>
    </div>
  );
}
