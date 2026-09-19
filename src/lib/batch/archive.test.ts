import { expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { streamArchive, type BatchReport } from "./archive";
it("exports exact output bytes with a local JSON report", async () => {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const report: BatchReport = { version: 1, scope: "local", images: [] };
  let finished = false;
  await streamArchive(
    [
      { name: "one.jpg", blob: new Blob(["image bytes"]) },
      { name: "two.jpg", blob: new Blob(["other bytes"]) },
    ],
    report,
    (bytes, final) => {
      chunks.push(bytes.slice());
      finished = final;
    },
  );
  const files = unzipSync(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  expect(Object.keys(files)).toEqual(["one.jpg", "two.jpg", "report.json"]);
  expect(strFromU8(files["one.jpg"])).toBe("image bytes");
  expect(JSON.parse(strFromU8(files["report.json"]))).toEqual(report);
  expect(finished).toBe(true);
});
it("aborts before reading output data", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    streamArchive(
      [{ name: "a.jpg", blob: new Blob(["x"]) }],
      { version: 1, scope: "", images: [] },
      () => {},
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
});
