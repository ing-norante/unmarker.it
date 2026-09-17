import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PauseIcon } from "@phosphor-icons/react/dist/ssr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/ssr/Play";
import { AdvertiseDialog } from "@/components/AdvertiseDialog";
import { MobileSponsorMarquee } from "@/components/MobileSponsorMarquee";
import { SponsorAdvertiseCard } from "@/components/SponsorAdvertiseCard";
import { SponsorFlipCard } from "@/components/SponsorFlipCard";
import { SponsorSingleCard } from "@/components/SponsorSingleCard";
import { Button } from "@/components/ui/button";
import {
  buildAllSidebarCards,
  getMobileBottomSponsors,
  getMobileTopSponsors,
  type SidebarCard,
} from "@/lib/sponsors";
import { cn } from "@/lib/utils";
import { observeSponsors, type SponsorPlacement } from "@/lib/sponsorTracking";
import {
  useSponsorCatalog,
  type SponsorCatalog,
} from "@/hooks/useSponsorCatalog";
import { SponsorPurchaseReturn } from "@/components/SponsorPurchaseReturn";

/** Shared by the homepage, loading shell and image workflow. */
export function SponsorLayout({ children }: { children: ReactNode }) {
  const catalog = useSponsorCatalog();
  const { sponsors, availableSpots, checkoutEnabled, testMode } = catalog;
  const cards = buildAllSidebarCards(sponsors);
  const topSponsors = getMobileTopSponsors(sponsors);
  const bottomSponsors = getMobileBottomSponsors(sponsors);
  const catalogKey = sponsors.map((s) => s.id).join(",");
  const { t } = useTranslation("common");
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (rootRef.current) return observeSponsors(rootRef.current);
  }, [catalogKey]);
  const MotionIcon = paused ? PlayIcon : PauseIcon;
  const controls = (
    <div className="flex items-center justify-center gap-1">
      <AdvertiseDialog
        availableSpots={availableSpots}
        checkoutEnabled={checkoutEnabled}
        testMode={testMode}
        compact
      />
      {sponsors.length > 0 && (
        <Button
          className="sponsor-motion-control"
          variant="ghost"
          size="icon-xs"
          onClick={() => setPaused(!paused)}
          aria-label={t(paused ? "sponsors.resume" : "sponsors.pause")}
        >
          <MotionIcon />
        </Button>
      )}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "sponsor-layout",
        topSponsors.length > 0 && "sponsor-layout-has-top",
        bottomSponsors.length > 0 && "sponsor-layout-has-bottom",
      )}
      data-sponsors-paused={paused}
    >
      <aside
        className="sponsor-sidebar sponsor-sidebar-left"
        aria-label={t("sponsors.leftLabel")}
      >
        <p className="text-muted-foreground text-center text-xs font-semibold">
          {t("sponsors.label")}
        </p>
        <div className="sponsor-sidebar-cards">
          <SidebarCards
            cards={cards.left}
            location="desktop_left"
            catalog={catalog}
          />
        </div>
      </aside>
      <aside
        className="sponsor-sidebar sponsor-sidebar-right"
        aria-label={t("sponsors.rightLabel")}
      >
        <p className="text-muted-foreground text-center text-xs font-semibold">
          {t("sponsors.label")}
        </p>
        <div className="sponsor-sidebar-cards">
          <SidebarCards
            cards={cards.right}
            location="desktop_right"
            catalog={catalog}
          />
        </div>
        {controls}
      </aside>
      {topSponsors.length > 0 && (
        <aside
          className="sponsor-mobile-bar sponsor-mobile-top"
          aria-label={t("sponsors.topLabel")}
        >
          <MobileSponsorMarquee sponsors={topSponsors} />
        </aside>
      )}
      <div className="sponsor-content">{children}</div>
      <div className="sponsor-mobile-controls">{controls}</div>
      <SponsorPurchaseReturn />
      {bottomSponsors.length > 0 && (
        <aside
          className="sponsor-mobile-bar sponsor-mobile-bottom"
          aria-label={t("sponsors.bottomLabel")}
        >
          <MobileSponsorMarquee sponsors={bottomSponsors} reverse />
        </aside>
      )}
    </div>
  );
}

function SidebarCards({
  cards,
  location,
  catalog,
}: {
  cards: SidebarCard[];
  location: SponsorPlacement["location"];
  catalog: SponsorCatalog;
}) {
  return cards.map((card, index) => {
    const placement = { location, position: index + 1 };
    switch (card.type) {
      case "sponsor-flip":
        return (
          <SponsorFlipCard
            key={card.front.id}
            front={card.front}
            back={card.back}
            delayMs={card.delayMs}
            placement={placement}
          />
        );
      case "sponsor-single":
        return (
          <SponsorSingleCard
            key={card.sponsor.id}
            sponsor={card.sponsor}
            placement={{ ...placement, face: "single" }}
          />
        );
      case "advertise":
        return (
          <SponsorAdvertiseCard
            key="advertise"
            availableSpots={catalog.availableSpots}
            checkoutEnabled={catalog.checkoutEnabled}
            testMode={catalog.testMode}
          />
        );
    }
  });
}
