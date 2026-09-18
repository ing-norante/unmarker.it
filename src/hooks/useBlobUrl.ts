import { useEffect, useState } from "react";

// Only the selected item's previews own URLs; the queue retains Blobs, not URLs.
export function useBlobUrl(blob: Blob | null) {
  const [value, setValue] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    let active = true;
    queueMicrotask(() => {
      if (active) setValue({ blob, url });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return value?.blob === blob ? value.url : null;
}
