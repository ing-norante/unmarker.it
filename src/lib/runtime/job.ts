import { createAbortError } from "./abort";

export interface JobSettlement<T> {
  readonly settled: boolean;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

interface JobOptions {
  signal?: AbortSignal;
  timeoutMs: number;
  timeoutMessage: string;
  cleanup: () => void;
  /** Persistent runtimes may invalidate sibling jobs when interrupted. */
  onInterrupt?: (error: Error) => void;
}

/** Settlement, abort and deadlines only. Each driver owns its worker lifetime and protocol. */
export function runJob<T>(
  options: JobOptions,
  start: (job: JobSettlement<T>) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
    const cleanup = () => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      options.cleanup();
    };
    const settle = (outcome: { value: T } | { error: Error }) => {
      if (settled) return;
      settled = true;
      try {
        cleanup();
      } catch (error) {
        reject("error" in outcome ? outcome.error : asError(error));
        return;
      }
      if ("error" in outcome) reject(outcome.error);
      else resolve(outcome.value);
    };
    const job: JobSettlement<T> = {
      get settled() {
        return settled;
      },
      resolve: (value) => settle({ value }),
      reject: (error) => settle({ error }),
    };
    const interrupt = (error: Error) => {
      if (settled) return;
      try {
        options.onInterrupt?.(error);
      } catch {
        /* A disposal failure must not leave the job pending. */
      } finally {
        job.reject(error);
      }
    };
    const abort = () => interrupt(createAbortError());
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    timeout = setTimeout(
      () => interrupt(new Error(options.timeoutMessage)),
      options.timeoutMs,
    );
    try {
      start(job);
    } catch (error) {
      job.reject(asError(error));
    }
  });
}

export function asError(error: unknown, fallback = "Operation failed") {
  return error instanceof Error ? error : new Error(fallback);
}
