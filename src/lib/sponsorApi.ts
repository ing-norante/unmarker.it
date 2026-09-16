import type { SponsorPurchaseStatus } from "@/lib/sponsorPurchase";

export class SponsorApiError extends Error {}

let sessionPromise: Promise<void> | null = null;
async function ensureSession() {
  sessionPromise ??= request("session")
    .then(() => undefined)
    .catch((error) => {
      sessionPromise = null;
      throw error;
    });
  return sessionPromise;
}

async function request(action: string, body?: FormData | { id: string }) {
  const response = await fetch(`/api/sponsors?action=${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "x-sponsor-client": "1",
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) sessionPromise = null;
    throw new SponsorApiError(data.error ?? "temporary_error");
  }
  return data;
}

export async function createSponsorCheckout(
  form: FormData,
): Promise<SponsorPurchaseStatus> {
  await ensureSession();
  return request("checkout", form);
}
export async function getSponsorPurchase(
  id: string,
): Promise<SponsorPurchaseStatus> {
  return request("status", { id });
}
export async function cancelSponsorPurchase(
  id: string,
): Promise<SponsorPurchaseStatus> {
  return request("cancel", { id });
}
export async function getSponsorPurchases(): Promise<SponsorPurchaseStatus[]> {
  await ensureSession();
  return (await request("purchases")).purchases;
}
