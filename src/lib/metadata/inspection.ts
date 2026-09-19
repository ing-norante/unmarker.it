import type { MetadataCleanResult, MetadataScanResult } from "@/lib/types";
import { originalCleanResult } from "./binary";
import type { ParseContext } from "./context";
import { hasBlockingCleanWarning } from "./markers";

/** An operation-local plan. Format parsers retain ownership of binary layout rules. */
export interface FormatInspection {
  scan: MetadataScanResult;
  apply(file: File, context: ParseContext): MetadataCleanResult;
}

export function createInspection(
  scan: MetadataScanResult,
  apply: (file: File, context: ParseContext) => MetadataCleanResult,
): FormatInspection {
  // Snapshot permission after ALL inspection work, including decompression.
  // Coverage/display warnings permit known edits; malformed/limited scans do not.
  const permitted = !hasBlockingCleanWarning(scan.warnings);
  return {
    scan,
    apply(file, context) {
      context.checkpoint();
      if (!permitted) return originalCleanResult(file, scan.format, scan.warnings);
      const result = apply(file, context);
      context.checkpoint();
      return result;
    },
  };
}
