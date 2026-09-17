import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MobileSponsorChip } from "@/components/MobileSponsorChip";
import type { Sponsor } from "@/lib/sponsors";
import { cn } from "@/lib/utils";

const PIXELS_PER_SECOND = 24;

/** Two identical groups form one exact loop; small lists stay still and fully visible. */
export function MobileSponsorMarquee({
  sponsors,
  reverse = false,
}: {
  sponsors: Sponsor[];
  reverse?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState({ overflow: false, duration: 60 });

  useEffect(() => {
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group) return;
    const measure = () => {
      const width = group.getBoundingClientRect().width;
      const next = {
        overflow: width > viewport.clientWidth,
        duration: width / PIXELS_PER_SECOND,
      };
      setMotion((previous) =>
        previous.overflow === next.overflow &&
        previous.duration === next.duration
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(group);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={viewportRef}
      className="sponsor-mobile-scroll"
      data-overflow={motion.overflow}
      onFocusCapture={(event) => {
        if (event.target.matches(":focus-visible"))
          event.target.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: "instant",
          });
      }}
      onBlurCapture={(event) => {
        // Keyboard browsing can scroll the static list. Do not carry that offset
        // into the moving track when focus leaves the strip.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          event.currentTarget.scrollLeft = 0;
      }}
    >
      <div
        className={cn("sponsor-marquee", reverse && "sponsor-marquee-reverse")}
        style={
          {
            "--sponsor-marquee-duration": `${motion.duration}s`,
          } as CSSProperties
        }
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            ref={copy === 0 ? groupRef : undefined}
            className="sponsor-marquee-group"
            aria-hidden={copy > 0 ? true : undefined}
          >
            {sponsors.map((sponsor, index) => (
              <MobileSponsorChip
                key={sponsor.id}
                sponsor={sponsor}
                tabIndex={copy > 0 ? -1 : undefined}
                placement={{
                  location: reverse ? "mobile_bottom" : "mobile_top",
                  position: index + 1,
                  face: "chip",
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
