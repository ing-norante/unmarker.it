import { z } from "zod";
import { transaction } from "./db.ts";
import { SponsorError } from "./config.ts";
import type { Purchase } from "./service.ts";

const stopRequest = z.object({
  id: z.uuid(),
  operator: z.string().trim().min(1).max(100),
  reference: z.string().trim().min(1).max(200),
});

// Administrator-only CLI operation. Deliberately not exposed by the public API.
// No Stripe mutation and no network dependency: a provider outage cannot prevent
// taking a previously confirmed paid campaign offline.
export async function stopSponsorPublication(
  input: z.input<typeof stopRequest>,
) {
  const { id, operator, reference } = stopRequest.parse(input);
  return transaction(async (db) => {
    const { rows } = await db.query<Purchase>(
      "SELECT * FROM sponsor_purchases WHERE id=$1 FOR UPDATE",
      [id],
    );
    const purchase = rows[0];
    if (!purchase) throw new SponsorError("not_found", 404);
    // Retrying must preserve the timestamp and evidence of the original action.
    if (purchase.publication_stopped_at) return purchase;
    if (
      !purchase.starts_at ||
      !purchase.expires_at ||
      purchase.expires_at.getTime() <= Date.now() ||
      !["active", "disputed"].includes(purchase.status)
    )
      throw new SponsorError("campaign_not_running", 409);
    const result = await db.query<Purchase>(
      `UPDATE sponsor_purchases SET publication_stopped_at=now(),
      publication_stopped_by=$2,publication_stop_reference=$3,updated_at=now()
      WHERE id=$1 RETURNING *`,
      [id, operator, reference],
    );
    return result.rows[0];
  });
}
