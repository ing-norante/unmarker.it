import { describe, expect, it } from "vitest";
import {
  getWorkflowFilePolicy,
  isMetadataFileCandidate,
  validateWorkflowFile,
  MAX_FILE_SIZE_BYTES,
} from "./fileValidation";

describe("file validation policies", () => {
  it("accepts browser images and metadata-only formats in the same workflow", () => {
    expect(getWorkflowFilePolicy().accept).toContain("image/*");
    expect(getWorkflowFilePolicy().accept).toContain(".heic");
    expect(getWorkflowFilePolicy().accept).toContain(".jxl");
  });

  it("accepts metadata files by supported extension when MIME type is absent", () => {
    const file = new File(["fixture"], "photo.heic", { type: "" });

    expect(isMetadataFileCandidate(file)).toBe(true);
  });

  it("distinguishes metadata candidates from browser image candidates", () => {
    const file = new File(["fixture"], "animation.gif", {
      type: "image/gif",
    });

    expect(isMetadataFileCandidate(file)).toBe(false);
  });

  it("accepts browser image candidates without requiring a supported metadata format", () => {
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

  it("enforces the file-size boundary before decoding", () => {
    const file = new File(["fixture"], "photo.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE_BYTES, configurable: true });
    expect(validateWorkflowFile(file).ok).toBe(true);
    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE_BYTES + 1 });
    const result = validateWorkflowFile(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusMessage.title.key).toBe("workflow:messages.fileLarge.title");
  });
});
