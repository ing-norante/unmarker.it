import { cn } from "@/lib/utils";
import {
  LightningIcon,
  LockKeyIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react";

export function Header({ className }: { className?: string }) {
  return (
    <header
      className={cn("relative flex shrink-0 flex-col gap-5 pb-1", className)}
    >
      <div className="relative flex flex-col gap-3">
        {/* <Sparkles className="fill-primary text-primary absolute top-0 right-10 size-5 sm:right-16" /> */}
        <h1 className="text-foreground text-[clamp(3.15rem,5vw,4.6rem)] leading-[0.88] font-black tracking-[-0.065em] sm:whitespace-nowrap">
          UNMARKER IT
        </h1>
        <p className="text-muted-foreground max-w-132 text-2xl leading-tight font-bold tracking-[-0.04em] sm:text-[1.55rem]">
          Remove invisible AI watermarks.
          <br />
          <span className="text-primary">100% client-side.</span>{" "}
          <span className="text-muted-foreground">
            Your image stays in your browser.
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Feature
          icon={ShieldCheckIcon}
          title="100% Private"
          body="Nothing leaves your device"
        />
        <Feature
          icon={LightningIcon}
          title="Blazing Fast"
          body="All processing happens locally"
        />
        <Feature
          icon={LockKeyIcon}
          title="No Uploads"
          body="Your image never leaves you"
        />
      </div>
    </header>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ShieldCheckIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="text-foreground size-5 shrink-0" weight="bold" />
      <div className="min-w-0">
        <div className="text-foreground text-xs leading-tight font-extrabold">
          {title}
        </div>
        <div className="text-muted-foreground text-[0.68rem] leading-tight font-medium">
          {body}
        </div>
      </div>
    </div>
  );
}
