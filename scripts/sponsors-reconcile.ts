import { database } from "../server/sponsors/db.ts";
import {
  reconcilePurchases,
  flushAnalytics,
} from "../server/sponsors/service.ts";
try {
  const result = await reconcilePurchases();
  await flushAnalytics();
  console.log(JSON.stringify(result));
  if (result.failures.length) process.exitCode = 1;
} finally {
  await database().end();
}
