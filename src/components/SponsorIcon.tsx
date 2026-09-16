import { useState } from "react";
import type { Sponsor } from "@/lib/sponsors";

export function SponsorIcon({
  sponsor,
  size = 24,
}: {
  sponsor: Sponsor;
  size?: number;
}) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const isImage = /^(https?:\/\/|\/)/.test(sponsor.icon);

  if (!isImage || failedIcon === sponsor.icon) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center font-bold"
        style={{ width: size, height: size }}
      >
        {isImage ? sponsor.name.slice(0, 1) : sponsor.icon}
      </span>
    );
  }

  return (
    <img
      src={sponsor.icon}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedIcon(sponsor.icon)}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
