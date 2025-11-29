import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
       className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          "border-2 border-black rounded-none focus-visible:ring-0 focus-visible:border-black focus-visible:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all", // Neobrutalist
          className
        )}
      {...props}
    />
  );
}

export { Input };
