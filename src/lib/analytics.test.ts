import type { CaptureResult } from "posthog-js";
import { describe, expect, it } from "vitest";
import { dropForeignScriptExceptions } from "./analytics";

function exceptionEvent(
  exceptionList: unknown,
  event = "$exception",
): CaptureResult {
  return {
    uuid: "test",
    event,
    properties: { $exception_list: exceptionList },
  } as CaptureResult;
}

describe("dropForeignScriptExceptions", () => {
  it("passes non-exception events through unchanged", () => {
    const event = {
      uuid: "test",
      event: "$pageview",
      properties: {},
    } as CaptureResult;
    expect(dropForeignScriptExceptions(event)).toBe(event);
  });

  it("keeps an exception with at least one in-app frame", () => {
    const event = exceptionEvent([
      {
        type: "TypeError",
        value: "boom",
        stacktrace: {
          frames: [{ in_app: false }, { in_app: true }],
        },
      },
    ]);
    expect(dropForeignScriptExceptions(event)).toBe(event);
  });

  it("drops an exception with no stack frames", () => {
    const event = exceptionEvent([{ type: "Error", value: "Script error." }]);
    expect(dropForeignScriptExceptions(event)).toBeNull();
  });

  it("drops an exception whose frames are all third-party", () => {
    const event = exceptionEvent([
      { stacktrace: { frames: [{ in_app: false }, { in_app: false }] } },
    ]);
    expect(dropForeignScriptExceptions(event)).toBeNull();
  });

  it("drops the extension DOM error even with in-app frames", () => {
    const event = exceptionEvent([
      {
        type: "NotFoundError",
        value:
          "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
        stacktrace: { frames: [{ in_app: true }] },
      },
    ]);
    expect(dropForeignScriptExceptions(event)).toBeNull();
  });

  it("drops known foreign globals", () => {
    for (const value of [
      "window.__KVARS__.translations is undefined",
      "response.cashbackReminder is undefined",
      "LIDNotifyId is not defined",
    ]) {
      const event = exceptionEvent([{ type: "ReferenceError", value }]);
      expect(dropForeignScriptExceptions(event)).toBeNull();
    }
  });
});
