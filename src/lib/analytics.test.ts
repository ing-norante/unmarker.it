import { describe, expect, it } from "vitest";
import { ANALYTICS_SCHEMA_VERSION, getSemanticEventName } from "./analytics";

describe("analytics taxonomy", () => {
  it("uses semantic workflow event names", () => {
    expect(getSemanticEventName("workflow_started")).toBe("workflow_started");
    expect(getSemanticEventName("processing_complete")).toBe(
      "processing_completed",
    );
    expect(getSemanticEventName("download_processed")).toBe(
      "processed_image_downloaded",
    );
  });

  it("renames the obsolete process button event as a retry", () => {
    expect(getSemanticEventName("process_image")).toBe("retry_started");
  });

  it("versions the new event schema", () => {
    expect(ANALYTICS_SCHEMA_VERSION).toBe(2);
  });
});
