import { SponsorIcon } from "@/components/SponsorIcon";
import { getMobileSponsorLabel, type Sponsor } from "@/lib/sponsors";
import { SponsorLink, type SponsorDisplayMode } from "./SponsorLink";

export function MobileSponsorChip({
  sponsor,
  tabIndex,
  ...mode
}: {
  sponsor: Sponsor;
  tabIndex?: number;
} & SponsorDisplayMode) {
  return (
    <SponsorLink
      {...mode}
      sponsor={sponsor}
      campaign="mobile_bar"
      tabIndex={tabIndex}
      className="bg-card text-card-foreground hover:border-primary focus-visible:ring-ring flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      <SponsorIcon sponsor={sponsor} size={20} />
      <span>{getMobileSponsorLabel(sponsor)}</span>
    </SponsorLink>
  );
}
