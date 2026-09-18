import { parseArgs } from "node:util";
import { z } from "zod";
import { database } from "../server/sponsors/db.ts";
import { getConfig } from "../server/sponsors/config.ts";
import { stopSponsorPublication } from "../server/sponsors/administration.ts";
import type { Purchase } from "../server/sponsors/service.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    operator: { type: "string" },
    reference: { type: "string" },
    apply: { type: "boolean", default: false },
    live: { type: "boolean", default: false },
  },
});
const id = z.uuid().parse(positionals[0]);
if (positionals.length !== 1)
  throw Error(
    "Usage: sponsors:stop <purchase UUID> --operator <name> --reference <request ref> [--apply] [--live]",
  );
const live = getConfig().live;
if (values.apply && live !== values.live)
  throw Error(
    "Environment mismatch: --live is required only when applying to live payments.",
  );

try {
  const purchase = values.apply
    ? await stopSponsorPublication({
        id,
        operator: values.operator ?? "",
        reference: values.reference ?? "",
      })
    : (
        await database().query<Purchase>(
          "SELECT * FROM sponsor_purchases WHERE id=$1",
          [id],
        )
      ).rows[0];
  if (!purchase) throw Error("Purchase not found");
  console.log(
    JSON.stringify(
      {
        mode: live ? "live" : "test",
        operation: values.apply ? "publication_stopped" : "read_only_preview",
        purchaseId: id,
        sponsor: purchase.name,
        paymentStatus: purchase.status,
        startsAt: purchase.starts_at,
        expiresAt: purchase.expires_at,
        stoppedAt: purchase.publication_stopped_at,
        message: values.apply
          ? "Publication stopped. No refund requested and no payment or campaign dates changed."
          : "No changes. Verify the customer request and purchase before running with --apply, --operator and --reference.",
      },
      null,
      2,
    ),
  );
} finally {
  await database().end();
}
