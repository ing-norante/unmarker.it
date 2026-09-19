import type { MetadataWarning } from "@/lib/types";
import { addWarning } from "./binary";

export const PNG_TEXT_CHUNK_LIMIT = 1024 * 1024;
export const PNG_TEXT_TOTAL_LIMIT = 4 * PNG_TEXT_CHUNK_LIMIT;

export interface ParseBudget {
  metadataBytesRemaining: number;
  pngTextBytesRemaining: number;
  pngTextChunkBytes: number;
  entriesRemaining: number;
}

export interface ParseContext {
  signal?: AbortSignal;
  budget: ParseBudget;
  checkpoint(): void;
  yieldIfNeeded(): Promise<void>;
}

export interface MetadataParseOptions {
  signal?: AbortSignal;
  /** Per-operation limits, primarily useful for constrained devices and tests. */
  budget?: Partial<ParseBudget>;
}

export function createParseContext(options: MetadataParseOptions = {}): ParseContext {
  const budget: ParseBudget = {
    metadataBytesRemaining: 16 * 1024 * 1024,
    pngTextBytesRemaining: PNG_TEXT_TOTAL_LIMIT,
    pngTextChunkBytes: PNG_TEXT_CHUNK_LIMIT,
    entriesRemaining: 100_000,
    ...options.budget,
  };
  for (const value of Object.values(budget)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Invalid metadata parse budget");
  }
  const checkpoint = () => options.signal?.throwIfAborted();
  let yieldAt = performance.now() + 8;
  return {
    signal: options.signal,
    budget,
    checkpoint,
    async yieldIfNeeded() {
      checkpoint();
      if (performance.now() >= yieldAt) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        checkpoint();
        yieldAt = performance.now() + 8;
      }
    },
  };
}

export function visitEntry(context: ParseContext, warnings: MetadataWarning[]): boolean {
  context.checkpoint();
  if (context.budget.entriesRemaining === 0) {
    addWarning(warnings, "metadata-scan-limit");
    return false;
  }
  context.budget.entriesRemaining -= 1;
  return true;
}

export function boundedMetadataBytes(bytes: Uint8Array, context: ParseContext, warnings: MetadataWarning[]): Uint8Array {
  context.checkpoint();
  const length = Math.min(bytes.length, context.budget.metadataBytesRemaining);
  context.budget.metadataBytesRemaining -= length;
  if (length < bytes.length) addWarning(warnings, "metadata-scan-limit");
  return bytes.subarray(0, length);
}
