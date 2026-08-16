import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

type ChunkModule<P> = { default: ComponentType<P> };
type ChunkLoader<P> = () => Promise<ChunkModule<P>>;

const RELOAD_FLAG_PREFIX = "chunk-reload:";

// A deploy rotates Vite's content hashes, so a tab that still holds the old
// index.html asks for chunks the server has removed. One retry clears a
// transient network failure. A second failure means the chunk is gone, so the
// page reloads to fetch fresh markup with the current hashes.
export function lazyWithReload<P>(
  chunkName: string,
  loader: ChunkLoader<P>,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() => loadChunk(chunkName, loader));
}

export async function loadChunk<P>(chunkName: string, loader: ChunkLoader<P>) {
  try {
    return await load(chunkName, loader);
  } catch (firstError) {
    try {
      return await load(chunkName, loader);
    } catch {
      reloadOnce(chunkName);
      throw firstError;
    }
  }
}

async function load<P>(chunkName: string, loader: ChunkLoader<P>) {
  const module = await loader();
  clearReloadFlag(chunkName);
  return module;
}

function reloadOnce(chunkName: string) {
  if (typeof window === "undefined") return;

  // Reload only once per chunk so a chunk that stays missing cannot loop.
  const key = RELOAD_FLAG_PREFIX + chunkName;
  if (window.sessionStorage.getItem(key)) return;

  window.sessionStorage.setItem(key, "1");
  window.location.reload();
}

function clearReloadFlag(chunkName: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(RELOAD_FLAG_PREFIX + chunkName);
}
