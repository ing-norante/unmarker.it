import { readFile } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = new Pool({ connectionString: process.env.DATABASE_URL });
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
