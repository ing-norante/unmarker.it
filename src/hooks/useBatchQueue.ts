import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BatchQueue } from "@/lib/batch/queue";
import { createTrackedImageProcessor } from "@/lib/engineTelemetry";
import { DEFAULT_OPTIONS } from "@/lib/pipeline";

export function useBatchQueue(initialFiles: readonly File[]) {
  const [queue] = useState(() => new BatchQueue(createTrackedImageProcessor()));
  const snapshot = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot,
  );
  const initialized = useRef(false);
  useEffect(() => {
    // Defer setup so StrictMode's probe cannot start a duplicate image job.
    let mounted = true;
    queueMicrotask(() => {
      if (mounted && !initialized.current) {
        initialized.current = true;
        queue.add(initialFiles, DEFAULT_OPTIONS);
      }
    });
    return () => {
      mounted = false;
    };
  }, [queue, initialFiles]);
  useEffect(() => {
    // Effect replay reclaims ownership before deferred disposal runs.
    const token = { alive: true };
    ownership.set(queue, token);
    return () => {
      token.alive = false;
      queueMicrotask(() => {
        if (ownership.get(queue) === token && !token.alive) queue.dispose();
      });
    };
  }, [queue]);
  return { queue, snapshot };
}
const ownership = new WeakMap<BatchQueue, { alive: boolean }>();
