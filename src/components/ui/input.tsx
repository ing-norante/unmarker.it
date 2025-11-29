import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "rounded-none border-2 border-black transition-all focus-visible:border-black focus-visible:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus-visible:ring-0", // Neobrutalist
        className,
      )}
      {...props}
    />
  );
}

export { Input };
