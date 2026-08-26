import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  [
    "inline-flex items-center justify-center rounded-full",
    "transition-colors duration-fast ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:text-disabled-foreground",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        ghost: "text-muted-foreground hover:bg-surface-sunken hover:text-foreground",
        surface: "border border-border bg-surface text-foreground shadow-subtle hover:bg-surface-sunken",
        primary: "bg-primary text-primary-foreground shadow-subtle hover:bg-primary/90",
        danger: "text-destructive hover:bg-destructive-soft",
      },
      size: {
        // 44px floor on the two larger sizes — the mobile touch-target minimum.
        sm: "h-9 w-9 [&_svg]:size-4",
        default: "h-11 w-11 [&_svg]:size-5",
        lg: "h-12 w-12 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "ghost", size: "default" },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  /** Required: an icon-only control is unusable without an accessible name. */
  label: string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, label, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      <span aria-hidden="true" className="inline-flex">
        {children}
      </span>
    </button>
  ),
);
IconButton.displayName = "IconButton";

export { IconButton };
