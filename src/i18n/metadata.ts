import type { MetadataWarning, MetadataWarningCode } from "@/lib/types";

import {
  message,
  translateMessage,
  type MessageKey,
  type MessageTranslator,
} from "./messages";

const warningKeys: Record<MetadataWarningCode, MessageKey> = {
  "metadata-scan-limit": "metadata:warnings.scanLimit",
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
  "png-text-limit": "metadata:warnings.pngTextLimit",
  "display-metadata-preserved": "metadata:warnings.displayMetadataPreserved",
  "box-item-coverage": "metadata:warnings.boxItemCoverage",
  "incomplete-box-table": "metadata:warnings.incompleteBoxTable",
  "incomplete-extended-box": "metadata:warnings.incompleteExtendedBox",
  "malformed-box-length": "metadata:warnings.malformedBoxLength",
  "jxl-codestream-scan-only": "metadata:warnings.jxlCodestream",
  "container-not-walkable": "metadata:warnings.containerNotWalkable",
};

export function translateMetadataWarning(
  t: MessageTranslator,
  warning: MetadataWarning,
) {
  return translateMessage(t, metadataWarningMessage(warning));
}

export function metadataWarningId(warning: MetadataWarning) {
  return `${warning.code}:${JSON.stringify(warning.values ?? {})}`;
}

export function metadataWarningMessage(warning: MetadataWarning) {
  return message(warningKeys[warning.code], warning.values);
}
