import { useCallback, useEffect, useRef, useState } from "react";

export function useObjectUrl() {
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const revokeCurrentUrl = useCallback(() => {
    if (!urlRef.current) {
      return;
    }

    URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const clearObjectUrl = useCallback(() => {
    revokeCurrentUrl();
    setUrl(null);
  }, [revokeCurrentUrl]);

  const setObjectUrl = useCallback(
    (object: Blob | MediaSource | null) => {
      revokeCurrentUrl();

      if (!object) {
        setUrl(null);
        return null;
      }

      const nextUrl = URL.createObjectURL(object);
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
