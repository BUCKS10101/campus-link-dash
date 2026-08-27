import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The single typographic entry point for the app's type system.
 *
 * Fredoka (the display/heading face) carries real weights, so emphasis
 * comes from weight, not a synthesized italic - `accent` bumps the
 * variant up to semibold rather than italicizing. Headings (h1-h3) all
 * share the same rounded display face now, at weights tuned per size so
 * smaller headings stay legible without looking thin.
 *
 * `variant` picks the style; `as` picks the element, so semantics and
 * appearance stay independent (a visual h2 can be a real <h1>).
 */
const textVariants = cva("", {
  variants: {
    variant: {
      display: "font-display text-display font-medium text-balance",
      displaySm: "font-display text-display-sm font-medium text-balance",
      h1: "font-display text-h1 font-medium text-balance",
      h2: "font-display text-h2 font-medium text-balance",
      h3: "font-display text-h3 font-semibold",
      body: "font-body text-body",
      bodySm: "font-body text-body-sm",
      caption: "font-body text-caption",
      /** Uppercase micro-label — section numbers, field labels, eyebrows. */
      label: "font-data text-label uppercase tracking-[0.13em] font-medium",
      /** Numeric / code — tips, distances, counts. Always tabular. */
      data: "font-data text-data tabular-nums",
      /** The largest numeral treatment — the OTP token. */
      dataLg: "font-data text-data-lg tabular-nums",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      faint: "text-faint",
      signal: "text-primary",
      signalDeep: "text-primary-deep",
      companion: "text-accent",
      info: "text-info",
      success: "text-success",
      warning: "text-warning",
      danger: "text-destructive",
      inherit: "",
    },
    /** Fredoka has no distinct italic personality worth using - emphasis
     *  bumps weight up to semibold instead. */
    accent: {
      true: "font-semibold",
      false: "",
    },
  },
  defaultVariants: { variant: "body", tone: "default", accent: false },
});

type TextElement = "p" | "span" | "div" | "h1" | "h2" | "h3" | "h4" | "label" | "small" | "strong" | "em";

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  as?: TextElement;
  asChild?: boolean;
}

const DEFAULT_ELEMENT: Record<string, TextElement> = {
  display: "h1",
  displaySm: "h1",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  body: "p",
  bodySm: "p",
  caption: "p",
  label: "span",
  data: "span",
  dataLg: "span",
};

const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ className, variant, tone, accent, as, asChild = false, ...props }, ref) => {
    const Comp = (asChild ? Slot : as ?? DEFAULT_ELEMENT[variant ?? "body"] ?? "p") as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(textVariants({ variant, tone, accent }), className)}
        {...props}
      />
    );
  },
);
Text.displayName = "Text";

export { Text };
