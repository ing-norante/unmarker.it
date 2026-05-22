import { lazy, Suspense, useEffect, useRef, useState } from "react";

const Footer = lazy(() =>
  import("@/components/Footer").then((module) => ({ default: module.Footer })),
);

type BrowserWithIdleCallback = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export function DeferredFooter() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || shouldRender) {
      return;
    }

    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            setShouldRender(true);
            observer.disconnect();
          }
        },
        {
          rootMargin: "600px 0px",
        },
      );
      observer.observe(anchor);
      return () => observer.disconnect();
    }

    const idleWindow = window as BrowserWithIdleCallback;
    if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(
        () => setShouldRender(true),
        {
          timeout: 5000,
        },
      );
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(() => setShouldRender(true), 5000);
    return () => globalThis.clearTimeout(timeoutId);
  }, [shouldRender]);

  return (
    <div ref={anchorRef}>
      {shouldRender && (
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      )}
    </div>
  );
}
