import * as React from "react";

import { cn } from "@/lib/utils";

export interface RuleProps extends React.HTMLAttributes<HTMLHRElement> {
  weight?: "hairline" | "strong";
}

/**
 * The primary structural device in Counter: a rule separates, a card
 * encloses. Most lists want separation, not a container — reach for
 * this before reaching for a bordered Surface.
 */
export function Rule({ weight = "hairline", className, ...props }: RuleProps) {
  return (
    <hr
      className={cn(
        "m-0 border-0 border-t",
        weight === "strong" ? "border-border-strong" : "border-border",
        className,
      )}
      {...props}
    />
  );
}
