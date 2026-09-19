import { pagePath, type AppPage, type SupportedLocale } from "../src/i18n/locales.ts";

export interface BuildChunk {
  file: string;
  imports?: string[];
  dynamicImports?: string[];
  isDynamicEntry?: boolean;
}

export type BuildManifest = Record<string, BuildChunk>;

/** File path within dist, using the same canonical paths as browser navigation. */
export function prerenderedPath(locale: SupportedLocale, page: AppPage) {
  return `${pagePath(locale, page).replace(/^\//, "").replace(/\/$/, "")}/index.html`
    .replace(/^\//, "");
}

/** Static imports only: following dynamic imports would eagerly load the engine. */
export function staticDependencies(manifest: BuildManifest, ...roots: string[]) {
  const seen = new Set<string>();
  function visit(key: string) {
    if (seen.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing build chunk: ${key}`);
    seen.add(key);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  roots.forEach(visit);
  return seen;
}
