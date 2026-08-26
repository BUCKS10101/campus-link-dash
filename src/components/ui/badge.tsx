import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Soft-filled badges: tinted background + saturated foreground. On a
 * busy feed this reads as information rather than as a second row of
 * buttons competing with the real call to action.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-caption font-semibold transition-colors duration-fast ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary",
        secondary: "bg-surface-sunken text-muted-foreground",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        destructive: "bg-destructive-soft text-destructive",
        info: "bg-info-soft text-info",
        accent: "bg-accent-soft text-accent",
        outline: "border-border bg-transparent text-foreground",
        solid: "bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
