import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-display font-semibold",
    "transition-[color,background-color,border-color,transform] duration-fast ease-out active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-foreground disabled:border-transparent disabled:shadow-none disabled:active:scale-100",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "rounded-md bg-primary text-primary-foreground shadow-subtle hover:bg-primary/90 active:bg-primary/95",
        secondary: "rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "rounded-md border border-border bg-surface text-foreground hover:bg-surface-sunken",
        ghost: "rounded-md text-foreground hover:bg-surface-sunken",
        destructive: "rounded-md bg-destructive text-destructive-foreground shadow-subtle hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-body-sm",
        default: "h-11 px-5 text-body-sm",
        lg: "h-12 px-7 text-body",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Shows a spinner and disables the button. The label stays mounted
   * (visually hidden) so the button keeps its width — swapping the text
   * for "Loading…" is the usual cause of layout shift on submit.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    // asChild forwards to an arbitrary element; a spinner wrapper would
    // break Slot's single-child contract, so pass through untouched.
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <Loader2 className="animate-spin" />
          </span>
        )}
        <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
