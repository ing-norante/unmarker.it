import { describe, expect, it } from "vitest";
import {
  FILE_MODE_POLICIES,
  isMetadataFileCandidate,
  validateMetadataFile,
} from "./fileValidation";

describe("file validation policies", () => {
  it("exposes mode-specific accept policies", () => {
    expect(FILE_MODE_POLICIES.unmark.accept).toBe("image/*");
    expect(FILE_MODE_POLICIES.metadata.accept).toContain(".jxl");
    expect(FILE_MODE_POLICIES.metadata.supportedCopy).toContain("AVIF");
  });

  it("accepts metadata files by supported extension when MIME type is absent", () => {
    const file = new File(["fixture"], "photo.heic", { type: "" });

    expect(isMetadataFileCandidate(file)).toBe(true);
  });

  it("rejects unsupported image MIME types in metadata mode", () => {
    const file = new File(["fixture"], "animation.gif", {
      type: "image/gif",
    });

    const result = validateMetadataFile(file);

    expect(result.ok).toBe(false);
  });
});
