import { SponsorIcon } from "@/components/SponsorIcon";
import { getSponsorUrl, type Sponsor } from "@/lib/sponsors";
import { cn } from "@/lib/utils";
import {
  sponsorTrackingAttributes,
  trackSponsorClick,
  type SponsorPlacement,
} from "@/lib/sponsorTracking";

export function SponsorSingleCard({
  sponsor,
  className,
  placement,
}: {
  sponsor: Sponsor;
  className?: string;
  placement: SponsorPlacement;
}) {
  return (
    <a
      {...sponsorTrackingAttributes(sponsor, placement)}
      onClick={() => trackSponsorClick(sponsor, placement)}
      onAuxClick={(event) => {
        if (event.button === 1) trackSponsorClick(sponsor, placement);
      }}
      href={getSponsorUrl(sponsor, "sponsor_card")}
      target="_blank"
      rel="sponsored noopener noreferrer"
      translate="no"
      className={cn(
        "sponsor-card bg-card text-card-foreground hover:border-primary focus-visible:ring-ring flex h-full min-w-0 flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        className,
      )}
    >
      <SponsorIcon sponsor={sponsor} />
      <h3 className="text-sm leading-snug font-extrabold wrap-anywhere">
        {sponsor.name}
      </h3>
      <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">
        {sponsor.claim}
      </p>
    </a>
  );
}
