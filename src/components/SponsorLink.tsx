import type { ReactNode } from "react";
import { getSponsorUrl, type Sponsor } from "@/lib/sponsors";
import {
  sponsorTrackingAttributes,
  trackSponsorClick,
  type SponsorPlacement,
} from "@/lib/sponsorTracking";

export type SponsorDisplayMode =
  | { preview: true; placement?: never }
  | { preview?: false; placement: SponsorPlacement };

/** Previews share the live presentation, but cannot navigate or emit analytics. */
export function SponsorLink({
  sponsor,
  campaign,
  className,
  children,
  tabIndex,
  ...mode
}: SponsorDisplayMode & {
  sponsor: Sponsor;
  campaign: "mobile_bar" | "sponsor_card";
  className: string;
  children: ReactNode;
  tabIndex?: number;
}) {
  if (mode.preview)
    return (
      <div translate="no" className={className}>
        {children}
      </div>
    );
  return (
    <a
      {...sponsorTrackingAttributes(sponsor, mode.placement)}
      onClick={() => trackSponsorClick(sponsor, mode.placement)}
      onAuxClick={(event) => {
        if (event.button === 1) trackSponsorClick(sponsor, mode.placement);
      }}
      href={getSponsorUrl(sponsor, campaign)}
      target="_blank"
      rel="sponsored noopener noreferrer"
      translate="no"
      tabIndex={tabIndex}
      className={className}
    >
      {children}
    </a>
  );
}
