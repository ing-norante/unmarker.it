import { spawnSync } from "node:child_process";
const url = new URL(process.env.DATABASE_URL || "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  throw new Error(
    "Sponsor integration tests require a local PostgreSQL database.",
  );
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "server/sponsors/service.test.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, SPONSOR_TEST_DATABASE_URL: url.toString() },
  },
);
process.exitCode = result.status ?? 1;
