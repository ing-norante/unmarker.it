import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.SPONSOR_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("SPONSOR_DATABASE_URL or DATABASE_URL is required");
const db = new Pool({ connectionString });
try {
  await db.query(
    await readFile(
      new URL("../server/sponsors/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Sponsor database schema is ready.");
} finally {
  await db.end();
}
