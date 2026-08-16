import type { MetadataWarning, MetadataWarningCode } from "@/lib/types";

const warningKeys: Record<MetadataWarningCode, string> = {
  "unsupported-clean": "metadata:warnings.unsupportedClean",
  "unsupported-scan": "metadata:warnings.unsupportedScan",
  "malformed-webp-header": "metadata:warnings.malformedWebpHeader",
  "webp-size-exceeds-file": "metadata:warnings.webpSize",
  "malformed-webp-table": "metadata:warnings.malformedWebpTable",
  "malformed-webp-chunk": "metadata:warnings.malformedWebpChunk",
  "malformed-jpeg-signature": "metadata:warnings.malformedJpegSignature",
  "malformed-jpeg-marker": "metadata:warnings.malformedJpegMarker",
  "malformed-jpeg-run": "metadata:warnings.malformedJpegRun",
  "malformed-jpeg-length": "metadata:warnings.malformedJpegLength",
  "malformed-jpeg-size": "metadata:warnings.malformedJpegSize",
  "malformed-jpeg-payload": "metadata:warnings.malformedJpegPayload",
  "malformed-png-signature": "metadata:warnings.malformedPngSignature",
  "malformed-png-table": "metadata:warnings.malformedPngTable",
  "malformed-png-length": "metadata:warnings.malformedPngLength",
  "missing-png-end": "metadata:warnings.missingPngEnd",
  "png-compressed-scan-only": "metadata:warnings.pngCompressedText",
  "png-decode-partial": "metadata:warnings.pngTextDecode",
  "incomplete-box-table": "metadata:warnings.incompleteBoxTable",
  "incomplete-extended-box": "metadata:warnings.incompleteExtendedBox",
  "malformed-box-length": "metadata:warnings.malformedBoxLength",
  "jxl-codestream-scan-only": "metadata:warnings.jxlCodestream",
  "container-not-walkable": "metadata:warnings.containerNotWalkable",
};

export function translateMetadataWarning(
  t: (key: never, options?: never) => unknown,
  warning: MetadataWarning,
) {
  return String(t(warningKeys[warning.code] as never, warning.values as never));
}

export function metadataWarningId(warning: MetadataWarning) {
  return `${warning.code}:${JSON.stringify(warning.values ?? {})}`;
}
