import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

if (!process.env.STRIPE_PRIVATE_KEY?.startsWith("sk_test_"))
  throw new Error("Only Stripe test keys are allowed.");
const child = spawn(
  "pnpm",
  [
    "exec",
    "stripe",
    "listen",
    "--forward-to",
    "http://127.0.0.1:5174/api/sponsors?action=webhook",
    "--events",
    "checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,payment_intent.succeeded,charge.refunded,charge.dispute.created,charge.dispute.closed",
  ],
  {
    env: { ...process.env, STRIPE_API_KEY: process.env.STRIPE_PRIVATE_KEY },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let buffer = "";
function output(chunk) {
  buffer += chunk.toString();
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    const secret = line.match(/whsec_[A-Za-z0-9]+/)?.[0];
    if (secret) {
      let env = readFileSync(".env", "utf8");
      env = /^STRIPE_WEBHOOK_SECRET=/m.test(env)
        ? env.replace(
            /^STRIPE_WEBHOOK_SECRET=.*$/m,
            `STRIPE_WEBHOOK_SECRET=${secret}`,
          )
        : `${env}\nSTRIPE_WEBHOOK_SECRET=${secret}\n`;
      writeFileSync(".env", env, { mode: 0o600 });
      console.log(
        "Stripe test webhook connected. Signing secret saved to .env; start/restart sponsors:api.",
      );
    } else console.log(line);
  }
}
child.stdout.on("data", output);
child.stderr.on("data", output);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
