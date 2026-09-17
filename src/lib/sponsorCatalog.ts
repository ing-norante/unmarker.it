import { TOTAL_SPONSOR_SLOTS, type Sponsor } from "./sponsors";

type PaidSponsor = Sponsor & { kind: "paid"; expiresAt: string };
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isPaidSponsor(value: unknown): value is PaidSponsor {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.name !== "string" ||
    !value.name ||
    typeof value.claim !== "string" ||
    typeof value.url !== "string" ||
    typeof value.icon !== "string" ||
    !value.icon ||
    value.kind !== "paid" ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    (value.mobileShowUrl !== undefined &&
      typeof value.mobileShowUrl !== "boolean")
  )
    return false;
  try {
    return ["https:", "http:"].includes(new URL(value.url).protocol);
  } catch {
    return false;
  }
}

// This runs on the homepage as well: keep the small response decoder independent
// of the form-validation bundle, which is only needed on the sponsorship route.
function parseCatalog(data: unknown) {
  if (
    !isRecord(data) ||
    !Array.isArray(data.sponsors) ||
    data.sponsors.length > TOTAL_SPONSOR_SLOTS ||
    !data.sponsors.every(isPaidSponsor) ||
    typeof data.availableSpots !== "number" ||
    !Number.isInteger(data.availableSpots) ||
    data.availableSpots < 0 ||
    data.availableSpots > TOTAL_SPONSOR_SLOTS ||
    typeof data.checkoutEnabled !== "boolean" ||
    typeof data.testMode !== "boolean"
  )
    throw new Error("invalid_catalog");
  return {
    sponsors: data.sponsors,
    availableSpots: data.availableSpots,
    checkoutEnabled: data.checkoutEnabled,
    testMode: data.testMode,
  };
}

/** Bound stalled requests and reject incomplete responses instead of inventing availability. */
export async function fetchSponsorCatalog(signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(abort, 10_000);
  try {
    const response = await fetch("/api/sponsors", {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("catalog_unavailable");
    return parseCatalog(await response.json());
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
