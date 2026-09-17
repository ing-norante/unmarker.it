import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { z } from "zod";
import { database } from "../server/sponsors/db.ts";
import { getConfig } from "../server/sponsors/config.ts";
import { purchaseConfirmation } from "../server/sponsors/confirmation.ts";
import type { Purchase } from "../server/sponsors/service.ts";

const id = z.uuid().parse(process.argv[2]);
const output = process.argv[3];
const language = z.enum(["it", "en"]).parse(process.argv[4] || "it");
if (!output)
  throw Error(
    "Usage: sponsors:confirmation <purchase UUID> <new private directory> [it|en]",
  );
try {
  const { rows } = await database().query<Purchase>(
    "SELECT * FROM sponsor_purchases WHERE id=$1",
    [id],
  );
  if (!rows[0]) throw Error("Purchase not found");
  const p = rows[0];
  const confirmation = purchaseConfirmation(p, language);
  const directory = resolve(output);
  await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
  // Refuse existing directories so an earlier confirmation cannot be overwritten.
  await mkdir(directory, { mode: 0o700 });
  const mode = getConfig().live ? "LIVE" : "TEST";
  await writeFile(
    join(directory, "email.txt"),
    `From: help@nomadesrl.it\nTo: ${confirmation.recipient}\nEnvironment: ${mode}\nPayment state: ${p.status}\n\n${confirmation.body}`,
    { mode: 0o600, flag: "wx" },
  );
  await writeFile(
    join(directory, "condizioni-accettate.txt"),
    confirmation.terms,
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    `Confirmation draft and accepted terms saved in ${directory}. Nothing sent. Review the environment/payment state, then copy the subject/body and attach condizioni-accettate.txt.`,
  );
} finally {
  await database().end();
}
