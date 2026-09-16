import { SponsorIcon } from "@/components/SponsorIcon";
import { getSponsorUrl, type Sponsor } from "@/lib/sponsors";
import {
  sponsorTrackingAttributes,
  trackSponsorClick,
  type SponsorPlacement,
} from "@/lib/sponsorTracking";

export function MobileSponsorChip({
  sponsor,
  tabIndex,
  placement,
}: {
  sponsor: Sponsor;
  tabIndex?: number;
  placement: SponsorPlacement;
}) {
  return (
    <a
      {...sponsorTrackingAttributes(sponsor, placement)}
      onClick={() => trackSponsorClick(sponsor, placement)}
      onAuxClick={(event) => {
        if (event.button === 1) trackSponsorClick(sponsor, placement);
      }}
      href={getSponsorUrl(sponsor, "mobile_bar")}
      target="_blank"
      rel="sponsored noopener noreferrer"
      translate="no"
      tabIndex={tabIndex}
      className="bg-card text-card-foreground hover:border-primary focus-visible:ring-ring flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      <SponsorIcon sponsor={sponsor} size={20} />
      <span>{sponsor.name}</span>
    </a>
  );
}
