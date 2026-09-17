import {
  CONSENT_STORAGE_KEY,
  createConsent,
  parseConsent,
  type ConsentReceipt,
} from "./consentPolicy";
export { CONSENT_STORAGE_KEY } from "./consentPolicy";

let receipt: ConsentReceipt | null = null;
let initialized = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function readStoredConsent() {
  try {
    return parseConsent(
      JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return null;
  }
}
function emit() {
  for (const listener of listeners) listener();
}
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  if (!receipt) return;
  expiryTimer = setTimeout(
    () => {
      if (receipt && receipt.expiresAt <= Date.now()) {
        receipt = null;
        emit();
      }
      scheduleExpiry();
    },
    Math.min(receipt.expiresAt - Date.now(), 2_147_483_647),
  );
}
function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  receipt = readStoredConsent();
  scheduleExpiry();
  window.addEventListener("storage", (event) => {
    if (event.key !== CONSENT_STORAGE_KEY && event.key !== null) return;
    receipt = readStoredConsent();
    scheduleExpiry();
    emit();
  });
}
export function getConsent() {
  initialize();
  return receipt && receipt.expiresAt > Date.now() ? receipt : null;
}
export const getServerConsent = () => null;
export function hasAnalyticsConsent() {
  return getConsent()?.analytics === true;
}
export function subscribeConsent(listener: () => void) {
  initialize();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function saveConsent(analytics: boolean) {
  initialize();
  receipt = createConsent(
    analytics,
    Math.max(Date.now(), (receipt?.updatedAt ?? 0) + 1),
  );
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(receipt));
  } catch {
    /* Keep this visit usable when storage is unavailable. */
  }
  scheduleExpiry();
  emit();
  return receipt;
}
export function openCookiePreferences() {
  window.dispatchEvent(new Event("unmarker:cookie-preferences"));
}

/** Only removes this project's analytics identifiers; never purchase or theme preferences. */
export function clearAnalyticsStorage() {
  if (typeof window === "undefined") return;
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const prefix = `ph_${key}`;
  for (const getStorage of [() => localStorage, () => sessionStorage]) {
    try {
      const storage = getStorage();
      for (let i = storage.length - 1; i >= 0; i--) {
        const name = storage.key(i);
        if (name?.startsWith(prefix) || name === `__ph_opt_in_out_${key}`)
          storage.removeItem(name);
      }
    } catch {
      /* Storage can be blocked independently of cookies. */
    }
  }
  try {
    const domains = window.location.hostname.split(".");
    const names = document.cookie.split(";").map((p) => p.trim().split("=")[0]);
    for (const name of names) {
      if (!name.startsWith(prefix) && name !== `__ph_opt_in_out_${key}`)
        continue;
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      for (let i = 0; i < domains.length - 1; i++) {
        document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${domains.slice(i).join(".")}; SameSite=Lax`;
      }
    }
  } catch {
    /* Best effort for legacy browser identifiers. */
  }
}

let syncGeneration = 0;
let syncFailed = false;
let syncPromise: Promise<boolean> = Promise.resolve(true);
const syncListeners = new Set<() => void>();
export const getConsentSyncFailed = () => syncFailed;
export const getServerSyncFailed = () => false;
export function subscribeConsentSync(listener: () => void) {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}
/** No buyer session is created for visitors who are only choosing cookies. */
export function syncSponsorConsent() {
  const generation = ++syncGeneration;
  const choice = getConsent() ?? createConsent(false);
  syncPromise = fetch("/api/sponsors?action=consent", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json", "x-sponsor-client": "1" },
    body: JSON.stringify(choice),
  })
    .then((response) => response.ok)
    .catch(() => false)
    .then((ok) => {
      if (generation === syncGeneration) {
        syncFailed = !ok;
        for (const listener of syncListeners) listener();
      }
      return ok;
    });
  return syncPromise;
}
