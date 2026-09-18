import { createServer } from "node:http";
import { Readable } from "node:stream";
import { handleSponsorRequest } from "../server/sponsors/http.ts";

const port = Number(process.env.SPONSOR_API_PORT || 5174);
createServer(async (req, res) => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers))
    if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  try {
    const result = await handleSponsorRequest(
      new Request(`http://localhost:${port}${req.url}`, init),
    );
    res.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    res.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end();
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Sponsor API ready on http://127.0.0.1:${port}`),
);
