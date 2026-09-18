import type { ManifestStore, Settings } from "@contentauth/c2pa-web";
import type { C2paAudit } from "@/lib/types";
import { incompleteC2pa, interpretManifestStore } from "./interpret";

export const LOCAL_C2PA_SETTINGS = {
  verify: {
    verifyAfterReading: true,
    remoteManifestFetch: false,
    ocspFetch: false,
    verifyTrust: false,
    verifyTimestampTrust: false,
  },
  cawgTrust: { verifyTrustList: false },
} satisfies Settings;

export interface LocalReader {
  manifestStore(): Promise<ManifestStore>;
  free(): Promise<void>;
}
export interface LocalRuntime {
  open(file: File): Promise<LocalReader | null>;
  dispose(): void;
}

async function loadRuntime(): Promise<LocalRuntime> {
  const [{ createC2pa, Reader, Context }, { default: wasmSrc }] = await Promise.all([
    import("@contentauth/c2pa-web"),
    import("@contentauth/c2pa-web/resources/c2pa.wasm?url"),
  ]);
  // Both SDK and WASM are served with the application; no CDN or remote trust lists.
  const sdk = await createC2pa({ wasmSrc });
  const context = new Context(LOCAL_C2PA_SETTINGS);
  return {
    open: (file) => Reader.fromBlob(sdk, file.type || file.name.split(".").pop() || "", file, context),
    dispose: () => sdk.dispose(),
  };
}

/** Serializes reads so cancelling one image cannot terminate another active read. */
export function createLocalC2paReader(
  load: () => Promise<LocalRuntime> = loadRuntime,
  timeoutMs = 30_000,
) {
  let runtime: { promise: Promise<LocalRuntime>; disposed: boolean } | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  function dispose() {
    const previous = runtime;
    runtime = undefined;
    if (previous && !previous.disposed) {
      previous.disposed = true;
      // Covers cancellation while SDK/WASM are still loading as well.
      void previous.promise.then((loaded) => loaded.dispose(), () => undefined);
    }
  }

  function read(file: File, presence: C2paAudit["presence"], signal?: AbortSignal): Promise<C2paAudit> {
    const task = queue.then(async () => {
      signal?.throwIfAborted();
      if (typeof Worker === "undefined" && load === loadRuntime) {
        return incompleteC2pa(presence, "reader-unavailable");
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      let aborted = false;
      const stopped = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          aborted = true;
          dispose();
          reject(new DOMException("Local C2PA reading timed out", "TimeoutError"));
        }, timeoutMs);
      });
      let abort: () => void = () => undefined;
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => {
          aborted = true;
          dispose();
          reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
        };
        signal?.addEventListener("abort", abort, { once: true });
      });
      const operation = async () => {
        if (!runtime) runtime = { promise: load(), disposed: false };
        const current = runtime;
        const loaded = await current.promise;
        if (current.disposed) throw new DOMException("Cancelled", "AbortError");
        let reader: LocalReader | null = null;
        try {
          reader = await loaded.open(file);
          if (aborted) return incompleteC2pa(presence, "timeout");
          if (!reader) return incompleteC2pa(presence, "remote-disabled");
          return interpretManifestStore(await reader.manifestStore());
        } finally {
          // Disposed workers own no remaining WASM allocations and cannot answer free().
          if (reader && !current.disposed) await reader.free();
        }
      };
      try {
        return await Promise.race([operation(), stopped, cancelled]);
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        // c2pa-rs deliberately returns this error when a file points to a
        // remote manifest and fetching is disabled. The runtime is healthy.
        if (error instanceof Error && /^C2pa\(RemoteManifestUrl\(/.test(error.message)) {
          return incompleteC2pa("referenced", "remote-disabled");
        }
        dispose();
        return incompleteC2pa(presence, error instanceof DOMException && error.name === "TimeoutError" ? "timeout" : "read-failed");
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    });
    queue = task.catch(() => undefined);
    return task;
  }
  return { read, dispose };
}

const localReader = createLocalC2paReader();
export const readLocalC2pa = localReader.read;
export const disposeLocalC2pa = localReader.dispose;
