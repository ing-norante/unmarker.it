import { describe, expect, it } from "vitest";
import {
  FILE_MODE_POLICIES,
  getWorkflowFilePolicy,
  isMetadataFileCandidate,
  validateWorkflowFile,
  validateMetadataFile,
} from "./fileValidation";

describe("file validation policies", () => {
  it("exposes mode-specific accept policies", () => {
    expect(FILE_MODE_POLICIES.unmark.accept).toBe("image/*");
    expect(FILE_MODE_POLICIES.metadata.accept).toContain(".jxl");
    expect(FILE_MODE_POLICIES.metadata.supportedCopy).toContain("AVIF");
    expect(getWorkflowFilePolicy().accept).toContain("image/*");
    expect(getWorkflowFilePolicy().accept).toContain(".heic");
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

  it("accepts decodable image candidates even when metadata mode would reject them", () => {
    const file = new File(["fixture"], "animation.gif", {
      type: "image/gif",
    });

    const result = validateWorkflowFile(file);

    expect(result.ok).toBe(true);
  });

  it("rejects non-image files outside supported metadata extensions", () => {
    const file = new File(["fixture"], "notes.txt", {
      type: "text/plain",
    });

    const result = validateWorkflowFile(file);

    expect(result.ok).toBe(false);
  });
});
