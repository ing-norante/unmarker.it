/** Bound temporary decoded strings independently of the file or metadata size. */
export const TEXT_SCAN_BLOCK_BYTES = 16 * 1024;
const MAX_SD_MARKER_LENGTH = 256;
const ENCODINGS = ["utf-8", "iso-8859-1", "utf-16le", "utf-16be"] as const;

interface TextConsumer {
  /** Return true when no more input is needed. */
  consume(text: string): boolean;
  finish(): boolean;
}

/**
 * Find the same literal and punctuation-normalized aliases as the metadata
 * scanner, in candidate order. Encodings are independent: their boundaries
 * must not manufacture matches. Only the first sd: token is returned, capped
 * to a small prefix so an untrusted token cannot retain the entire input.
 */
export function findTextMarkers(
  bytes: Uint8Array,
  candidates: readonly string[],
  checkpoint?: () => void,
): string[] {
  const search = createMarkerSearch(candidates);
  drainDecodedBlocks(scanDecodedBlocks(bytes, search.createConsumer, checkpoint));
  return search.result();
}

/** Same scanner with browser task yields between bounded blocks. */
export async function findTextMarkersAsync(
  bytes: Uint8Array,
  candidates: readonly string[],
  controls: { checkpoint(): void; yieldIfNeeded(): Promise<void> },
): Promise<string[]> {
  const search = createMarkerSearch(candidates);
  const blocks = scanDecodedBlocks(bytes, search.createConsumer, controls.checkpoint);
  let step = blocks.next();
  while (!step.done) {
    await controls.yieldIfNeeded();
    controls.checkpoint();
    step = blocks.next();
  }
  return search.result();
}

function createMarkerSearch(candidates: readonly string[]) {
  const targets = [...new Set(candidates)].map((candidate) => ({
    candidate,
    literal: candidate.toLowerCase(),
    normalized: normalizeMarkerText(candidate),
  }));
  const found = new Set<string>();
  const literalCarryLength = maxCarryLength(targets.map(({ literal }) => literal));
  const normalizedCarryLength = maxCarryLength(targets.map(({ normalized }) => normalized));
  let sdMarker: string | undefined;
  const complete = () => found.size === targets.length && sdMarker !== undefined;

  const createConsumer = (): TextConsumer => {
    let literalCarry = "";
    let normalizedCarry = "";
    let previousSeparator = false;
    const sdScanner = new SdMarkerScanner();

    return {
      consume(text) {
        const literal = literalCarry + text;
        let normalizedBlock = normalizeMarkerText(text);
        if (normalizedBlock) {
          const endedWithSeparator = normalizedBlock.endsWith("_");
          if (previousSeparator && normalizedBlock.startsWith("_")) {
            normalizedBlock = normalizedBlock.slice(1);
          }
          previousSeparator = endedWithSeparator;
        }
        const normalized = normalizedCarry + normalizedBlock;

        for (const { candidate, literal: needle, normalized: normalizedNeedle } of targets) {
          if (!found.has(candidate) && (literal.includes(needle) || normalized.includes(normalizedNeedle))) {
            found.add(candidate);
          }
        }

        literalCarry = trailing(literal, literalCarryLength);
        normalizedCarry = trailing(normalized, normalizedCarryLength);
        if (sdMarker === undefined) sdMarker = sdScanner.consume(text);
        return complete();
      },
      finish() {
        if (sdMarker === undefined) sdMarker = sdScanner.finish();
        return complete();
      },
    };
  };

  return { createConsumer, result: () => [
    ...targets.filter(({ candidate }) => found.has(candidate)).map(({ candidate }) => candidate),
    ...(sdMarker !== undefined && !found.has(sdMarker) ? [sdMarker] : []),
  ] };
}

/** Case-insensitive literal checks, without punctuation normalization or sd: extraction. */
export function containsMetadataText(
  bytes: Uint8Array,
  needles: readonly string[],
  checkpoint?: () => void,
): boolean {
  const targets = [...new Set(needles.map((needle) => needle.toLowerCase()))];
  const carryLength = maxCarryLength(targets);
  let found = false;

  drainDecodedBlocks(scanDecodedBlocks(bytes, () => {
    let carry = "";
    return {
      consume(text) {
        const joined = carry + text;
        found = targets.some((needle) => joined.includes(needle));
        carry = trailing(joined, carryLength);
        return found;
      },
      finish: () => found,
    };
  }, checkpoint));

  return found;
}

function* scanDecodedBlocks(
  bytes: Uint8Array,
  createConsumer: () => TextConsumer,
  checkpoint?: () => void,
) {
  for (const encoding of ENCODINGS) {
    checkpoint?.();
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(encoding);
    } catch {
      // Preserve support for runtimes missing one of the optional encodings.
      continue;
    }
    const consumer = createConsumer();
    for (let offset = 0; offset < bytes.length; offset += TEXT_SCAN_BLOCK_BYTES) {
      checkpoint?.();
      const decoded = decoder.decode(bytes.subarray(offset, offset + TEXT_SCAN_BLOCK_BYTES), { stream: true });
      if (consumer.consume(searchable(decoded))) return;
      yield;
    }
    checkpoint?.();
    if (consumer.consume(searchable(decoder.decode())) || consumer.finish()) return;
  }
}

function drainDecodedBlocks(blocks: Generator<void, void, unknown>) {
  let step = blocks.next();
  while (!step.done) step = blocks.next();
}

function searchable(text: string) {
  return text.replace(/\0/g, "").toLowerCase();
}

function normalizeMarkerText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9:*]+/g, "_");
}

function maxCarryLength(needles: readonly string[]) {
  return needles.reduce((length, needle) => Math.max(length, needle.length - 1), 0);
}

function trailing(text: string, length: number) {
  return length > 0 ? text.slice(-length) : "";
}

class SdMarkerScanner {
  private carry = "";
  private carryPrecededByWord = false;
  private pending: string | undefined;

  consume(text: string): string | undefined {
    if (!text) return undefined;

    if (this.pending !== undefined) {
      const continuation = /^[a-z0-9_:-]+/.exec(text)?.[0] ?? "";
      this.pending += continuation.slice(0, MAX_SD_MARKER_LENGTH - this.pending.length);
      if (continuation.length < text.length || this.pending.length === MAX_SD_MARKER_LENGTH) {
        return this.pending;
      }
      return undefined;
    }

    const joined = this.carry + text;
    const pattern = /\bsd:[a-z0-9_:-]+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(joined)) !== null) {
      if (match.index === 0 && this.carryPrecededByWord) {
        // A carried suffix is not a new word boundary. Start again after it,
        // because a genuine boundary can still occur inside this false match.
        pattern.lastIndex = 1;
        continue;
      }
      const marker = match[0].slice(0, MAX_SD_MARKER_LENGTH);
      if (pattern.lastIndex < joined.length || marker.length === MAX_SD_MARKER_LENGTH) return marker;
      this.pending = marker;
      return undefined;
    }

    if (joined.length > 4) this.carryPrecededByWord = /\w/.test(joined[joined.length - 5]);
    this.carry = joined.slice(-4);
    return undefined;
  }

  finish() {
    return this.pending;
  }
}
