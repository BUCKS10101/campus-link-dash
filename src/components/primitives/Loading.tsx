import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading primitives.
 *
 * Skeletons must match the dimensions of what replaces them. A skeleton
 * that is the wrong height causes exactly the layout shift it exists to
 * prevent, so these mirror the real components' spacing rather than being
 * generic grey boxes.
 */

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "default" | "lg";
  /** Announced to screen readers; pass null for purely decorative use. */
  label?: string | null;
}

const SPINNER_SIZE = { sm: "size-4", default: "size-5", lg: "size-8" } as const;

export function Spinner({ size = "default", label = "Loading", className, ...props }: SpinnerProps) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
      className={cn("inline-flex items-center justify-center text-muted-foreground", className)}
      {...props}
    >
      <Loader2 className={cn("animate-spin", SPINNER_SIZE[size])} aria-hidden="true" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
  /** Last line renders short, the way real wrapped text ends. */
  lastLineWidth?: string;
}

export function SkeletonText({ lines = 3, lastLineWidth = "60%", className, ...props }: SkeletonTextProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true" {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={i === lines - 1 ? { width: lastLineWidth } : undefined}
        />
      ))}
    </div>
  );
}

/** Matches the resting geometry of a Card: 1px border, rounded-lg, p-5. */
export function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-surface p-5 shadow-subtle", className)}
      aria-hidden="true"
      {...props}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Skeleton className="h-4" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export interface LoadingRegionProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
}

/** Centred spinner for a whole route or panel. */
export function LoadingRegion({ label = "Loading", className, ...props }: LoadingRegionProps) {
  return (
    <div
      className={cn("flex min-h-[50vh] w-full flex-col items-center justify-center gap-3", className)}
      {...props}
    >
      <Spinner size="lg" label={null} />
      <span className="font-body text-body-sm text-muted-foreground" role="status" aria-live="polite">
        {label}
      </span>
    </div>
  );
}
