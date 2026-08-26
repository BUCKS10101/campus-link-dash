import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-surface px-3 py-2 text-body",
          "transition-colors duration-fast ease-out",
          "file:border-0 file:bg-transparent file:text-body-sm file:font-medium file:text-foreground",
          "placeholder:text-faint",
          "hover:border-ring/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30",
          "md:text-body-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
