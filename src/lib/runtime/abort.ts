export function createAbortError() {
  return new DOMException("Processing cancelled", "AbortError");
}

export function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createAbortError();
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

/** Ignore a late result while still releasing resources that arrive after cancellation. */
export function abortable<T>(
  task: Promise<T>,
  signal?: AbortSignal,
  disposeLateResult?: (value: T) => void,
): Promise<T> {
  if (!signal) return task;
  return new Promise((resolve, reject) => {
    let cancelled = false;
    const onAbort = () => {
      cancelled = true;
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    task.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (cancelled) disposeLateResult?.(value);
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        if (!cancelled) reject(error);
      },
    );
  });
}
