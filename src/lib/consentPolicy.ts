/** Shared by the browser and sponsor API; bump only for material purpose changes. */
export const CONSENT_VERSION = "2026-09-17";
export const CONSENT_STORAGE_KEY = "unmarker_consent";
export interface ConsentReceipt {
  version: typeof CONSENT_VERSION;
  analytics: boolean;
  updatedAt: number;
  expiresAt: number;
}
export function consentExpiry(updatedAt: number) {
  const date = new Date(updatedAt);
  date.setUTCMonth(date.getUTCMonth() + 6);
  return date.getTime();
}
export function parseConsent(
  value: unknown,
  now = Date.now(),
): ConsentReceipt | null {
  if (!value || typeof value !== "object") return null;
  const receipt = value as Partial<ConsentReceipt>;
  if (
    receipt.version !== CONSENT_VERSION ||
    typeof receipt.analytics !== "boolean" ||
    !Number.isSafeInteger(receipt.updatedAt) ||
    !Number.isSafeInteger(receipt.expiresAt) ||
    receipt.updatedAt! <= 0 ||
    receipt.updatedAt! > now + 60_000 ||
    receipt.expiresAt! !== consentExpiry(receipt.updatedAt!) ||
    receipt.expiresAt! <= now
  )
    return null;
  return receipt as ConsentReceipt;
}
export function createConsent(
  analytics: boolean,
  updatedAt = Date.now(),
): ConsentReceipt {
  return {
    version: CONSENT_VERSION,
    analytics,
    updatedAt,
    expiresAt: consentExpiry(updatedAt),
  };
}
