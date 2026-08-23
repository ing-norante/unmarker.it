import { describe, expect, it } from "vitest";
import { createParallelDiff } from "../src/diff";

describe("parallel text diff", () => {
  it("marks removals and additions independently while preserving both texts", () => {
    const result = createParallelDiff(
      "Il modello conserva i numeri.",
      "Il sistema preserva i numeri.",
    );

    expect(result.source.map((segment) => segment.value).join("")).toBe(
      "Il modello conserva i numeri.",
    );
    expect(result.candidate.map((segment) => segment.value).join("")).toBe(
      "Il sistema preserva i numeri.",
    );
    expect(result.source.some((segment) => segment.kind === "removed")).toBe(
      true,
    );
    expect(result.candidate.some((segment) => segment.kind === "added")).toBe(
      true,
    );
  });
});
