import { describe, expect, it, vi } from "vitest";
import { abortable } from "./abort";

describe("abortable resource tasks", () => {
  it("disposes decoded resources that arrive after cancellation", async () => {
    let finish!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const dispose = vi.fn();
    const controller = new AbortController();
    const task = abortable(pending, controller.signal, dispose);
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    finish("late bitmap");
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledWith("late bitmap");
  });
});
