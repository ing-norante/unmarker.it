import type { CSSProperties } from "react";
import { SponsorSingleCard } from "@/components/SponsorSingleCard";
import type { Sponsor } from "@/lib/sponsors";
import type { SponsorPlacement } from "@/lib/sponsorTracking";

export function SponsorFlipCard({
  front,
  back,
  delayMs = 0,
  placement,
}: {
  front: Sponsor;
  back: Sponsor;
  delayMs?: number;
  placement: Omit<SponsorPlacement, "face">;
}) {
  return (
    <div
      className="sponsor-flip h-full"
      style={{ "--sponsor-delay": `${-delayMs}ms` } as CSSProperties}
    >
      <div className="sponsor-flip-rotor">
        <div className="sponsor-flip-face sponsor-flip-front">
          <SponsorSingleCard
            sponsor={front}
            placement={{ ...placement, face: "front" }}
          />
        </div>
        <div className="sponsor-flip-face sponsor-flip-back">
          <SponsorSingleCard
            sponsor={back}
            placement={{ ...placement, face: "back" }}
          />
        </div>
      </div>
    </div>
  );
}
