import { triggerBrowserDownload } from "./download";

// Give the browser time to accept the download before releasing its URL.
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  try {
    triggerBrowserDownload(url, name);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
