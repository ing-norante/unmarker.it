import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value || 0}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progress"
      className={cn(
        "bg-secondary relative h-4 w-full overflow-hidden rounded-full",
        "border-foreground bg-background rounded-none border-2", // Neobrutalist override with dark mode support
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
