/* eslint-disable react-refresh/only-export-components */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center gap-1.5 py-0.5 text-xs leading-5 font-medium whitespace-nowrap before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-[''] has-[>svg]:before:hidden sm:text-sm [&>svg]:pointer-events-none [&>svg]:size-3.5! sm:[&>svg]:size-4!",
  {
    variants: {
      variant: {
        default: "text-primary-text",
        secondary: "text-muted-foreground",
        destructive: "text-destructive-text",
        outline: "text-muted-foreground",
        ghost: "text-muted-foreground",
        link: "text-primary-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
