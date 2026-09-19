import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { LocaleSuggestion } from "./LocaleSuggestion";
import { cn } from "@/lib/utils";

/** Shared tool shell. SponsorLayout stays above this boundary in App. */
export function WorkspaceFrame({
  children,
  below,
  mode = "shell",
  footer = true,
}: {
  children: ReactNode;
  below?: ReactNode;
  mode?: "shell" | "batch";
  footer?: boolean;
}) {
  return (
    <div className="bg-background text-foreground selection:bg-primary selection:text-primary-foreground flex min-h-dvh flex-col overflow-x-clip font-sans">
      <main
        className={cn(
          "wide-display-grid grid min-w-0 grid-cols-1 items-start gap-8 px-(--page-gutter) py-8 lg:grid-cols-[minmax(28rem,42%)_minmax(0,1fr)] lg:gap-x-10 lg:py-10 xl:grid-cols-[minmax(34rem,45%)_minmax(0,1fr)] xl:gap-x-12",
          mode === "shell" &&
            "relative z-10 w-full content-start lg:min-h-0 2xl:gap-x-16 2xl:py-12",
        )}
      >
        {children}
      </main>
      {below && <div className="px-(--page-gutter) pb-8">{below}</div>}
      {footer && (
        <>
          <div
            className={cn(
              "px-(--page-gutter)",
              mode === "batch" ? "mt-auto pb-8" : "pb-6 lg:pb-8",
            )}
          >
            <Footer />
          </div>
          <div translate="no">
            <LocaleSuggestion />
          </div>
        </>
      )}
    </div>
  );
}
