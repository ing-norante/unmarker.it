export const SPONSOR_MIN_VISIBLE_RATIO = 0.5;
export const SPONSOR_MIN_VISIBLE_MS = 1000;

interface Exposure {
  since: number | null;
  lastSample: number | null;
  impressionId: string | null;
  clicked: boolean;
  impressionClicked: boolean;
}

/** One qualified impression per sponsor + placement + face per page view.
 * Duplicate marquee copies feed the same key; neither remounts nor rotations
 * generate additional impressions. A new page view creates a new ledger.
 */
export class SponsorViewability {
  private exposures = new Map<string, Exposure>();
  private readonly createId: () => string;
  constructor(createId: () => string) {
    this.createId = createId;
  }

  sample(key: string, visible: boolean, now: number): string | null {
    const exposure = this.get(key);
    if (!visible) {
      exposure.since = null;
      exposure.lastSample = null;
      return null;
    }
    // A delayed/throttled timer is not proof of continuous exposure.
    if (exposure.lastSample === null || now - exposure.lastSample > 500) {
      exposure.since = now;
    }
    exposure.lastSample = now;
    if (
      exposure.impressionId ||
      now - (exposure.since ?? now) < SPONSOR_MIN_VISIBLE_MS
    )
      return null;
    exposure.impressionId = this.createId();
    return exposure.impressionId;
  }

  resetContinuity() {
    for (const exposure of this.exposures.values()) {
      exposure.since = null;
      exposure.lastSample = null;
    }
  }

  click(key: string) {
    const exposure = this.get(key);
    const firstClick = !exposure.clicked;
    const firstImpressionClick =
      exposure.impressionId !== null && !exposure.impressionClicked;
    exposure.clicked = true;
    if (exposure.impressionId) exposure.impressionClicked = true;
    return {
      impressionId: exposure.impressionId,
      firstClick,
      firstImpressionClick,
    };
  }

  private get(key: string): Exposure {
    let exposure = this.exposures.get(key);
    if (!exposure) {
      exposure = {
        since: null,
        lastSample: null,
        impressionId: null,
        clicked: false,
        impressionClicked: false,
      };
      this.exposures.set(key, exposure);
    }
    return exposure;
  }
}
