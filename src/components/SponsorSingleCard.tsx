import { SponsorIcon } from "@/components/SponsorIcon";
import { type Sponsor } from "@/lib/sponsors";
import { cn } from "@/lib/utils";
import { SponsorLink, type SponsorDisplayMode } from "./SponsorLink";

export function SponsorSingleCard({
  sponsor,
  className,
  ...mode
}: {
  sponsor: Sponsor;
  className?: string;
} & SponsorDisplayMode) {
  return (
    <SponsorLink
      {...mode}
      sponsor={sponsor}
      campaign="sponsor_card"
      className={cn(
        "sponsor-card bg-card text-card-foreground hover:border-primary focus-visible:ring-ring flex h-68 min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2.5 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        className,
      )}
    >
      <SponsorIcon sponsor={sponsor} />
      <h3 className="shrink-0 text-sm leading-4 font-extrabold wrap-anywhere">
        {sponsor.name}
      </h3>
      <p className="text-muted-foreground min-h-0 overflow-y-auto text-xs leading-4 wrap-anywhere">
        {sponsor.claim}
      </p>
    </SponsorLink>
  );
}
