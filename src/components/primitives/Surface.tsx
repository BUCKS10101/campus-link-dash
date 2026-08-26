import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * An elevation-aware container.
 *
 * The elevation scale has exactly four steps (see index.css). Passing a
 * one-off `shadow-[...]` at a call site is what produced the drifting,
 * slightly-different card shadows in the previous build.
 */
const surfaceVariants = cva("", {
  variants: {
    level: {
      flat: "bg-surface",
      subtle: "bg-surface shadow-subtle",
      default: "bg-surface shadow-default",
      elevated: "bg-surface-elevated shadow-elevated",
      floating: "bg-surface-elevated shadow-floating",
      sunken: "bg-surface-sunken",
    },
    bordered: {
      true: "border border-border",
      false: "",
    },
    radius: {
      sm: "rounded-sm",
      md: "rounded-md",
      lg: "rounded-lg",
      xl: "rounded-xl",
      none: "",
    },
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
      xl: "p-6",
    },
    interactive: {
      true: "transition-shadow duration-base ease-out hover:shadow-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      false: "",
    },
  },
  defaultVariants: {
    level: "subtle",
    bordered: true,
    radius: "lg",
    padding: "none",
    interactive: false,
  },
});

export interface SurfaceProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof surfaceVariants> {
  asChild?: boolean;
}

const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, level, bordered, radius, padding, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(surfaceVariants({ level, bordered, radius, padding, interactive }), className)}
      {...props}
    />
  ),
);
Surface.displayName = "Surface";

export { Surface };
