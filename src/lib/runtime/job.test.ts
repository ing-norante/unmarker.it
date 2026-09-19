import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runJob, type JobSettlement } from "./job";

describe("job settlement and interruption", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const options = (cleanup = vi.fn()) => ({
    timeoutMs: 100,
    timeoutMessage: "deadline",
    cleanup,
  });

  it("rejects a pre-aborted job without starting and releases resources once", async () => {
    const controller = new AbortController();
    controller.abort();
    const cleanup = vi.fn();
    const start = vi.fn();
    await expect(
      runJob({ ...options(cleanup), signal: controller.signal }, start),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(start).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores late settlement and abort after success", async () => {
    const controller = new AbortController();
    const cleanup = vi.fn();
    let job!: JobSettlement<string>;
    const pending = runJob<string>(
      { ...options(cleanup), signal: controller.signal },
      (current) => {
        job = current;
      },
    );
    job.resolve("output");
    job.reject(new Error("late"));
    controller.abort();
    await expect(pending).resolves.toBe("output");
    expect(job.settled).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans up synchronous dispatch failures", async () => {
    const cleanup = vi.fn();
    await expect(
      runJob(options(cleanup), () => {
        throw new Error("dispatch failed");
      }),
    ).rejects.toThrow("dispatch failed");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("invalidates a persistent runtime on timeout even if that also settles its job", async () => {
    const cleanup = vi.fn();
    let job!: JobSettlement<string>;
    const interrupted = vi.fn((error: Error) => {
      job.reject(error);
    });
    const pending = runJob<string>(
      { ...options(cleanup), onInterrupt: interrupted },
      (current) => {
        job = current;
      },
    );
    const rejected = expect(pending).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(interrupted).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("still rejects cancellation when interrupt disposal throws", async () => {
    const controller = new AbortController();
    const cleanup = vi.fn();
    const pending = runJob(
      {
        ...options(cleanup),
        signal: controller.signal,
        onInterrupt: () => {
          throw new Error("dispose failed");
        },
      },
      () => {},
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
