import { useCallback, useEffect, useRef, useState } from "react";
import {
  createObjectUrl,
  revokeObjectUrl,
  type ObjectUrlSource,
} from "@/lib/objectUrl";

export function useObjectUrl() {
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const revokeCurrentUrl = useCallback(() => {
    if (!urlRef.current) {
      return;
    }

    revokeObjectUrl(urlRef.current);
    urlRef.current = null;
  }, []);

  const clearObjectUrl = useCallback(() => {
    revokeCurrentUrl();
    setUrl(null);
  }, [revokeCurrentUrl]);

  const setObjectUrl = useCallback(
    (object: ObjectUrlSource | null) => {
      revokeCurrentUrl();

      if (!object) {
        setUrl(null);
        return null;
      }

      const nextUrl = createObjectUrl(object);
      urlRef.current = nextUrl;
      setUrl(nextUrl);
      return nextUrl;
    },
    [revokeCurrentUrl],
  );

  useEffect(() => revokeCurrentUrl, [revokeCurrentUrl]);

  return {
    url,
    setObjectUrl,
    clearObjectUrl,
  };
}
