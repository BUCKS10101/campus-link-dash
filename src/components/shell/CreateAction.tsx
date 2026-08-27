import * as React from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

export interface CreateActionProps {
  href: string;
  variant: "desktop" | "mobile";
  active?: boolean;
}

/**
 * The product's central action, in the same pill/organic language as
 * every other button in the app (see button.tsx) — a continuous system,
 * not a differently-shaped exception just because this one sits in the
 * nav.
 */
export function CreateAction({ href, variant, active = false }: CreateActionProps) {
  if (variant === "desktop") {
    return (
      <Link
        to={href}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2",
          "font-body text-body-sm font-semibold text-primary-foreground",
          "transition-colors duration-fast ease-out hover:bg-primary/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
        Post
      </Link>
    );
  }

  return (
    <Link
      to={href}
      aria-current={active ? "page" : undefined}
      aria-label="Post a request"
      className="relative flex min-w-[56px] flex-col items-center justify-center gap-1 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span
        className={cn(
          "-mt-6 flex size-12 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground shadow-elevated",
          "ring-4 ring-background",
          "transition-transform duration-fast ease-out active:scale-95",
        )}
      >
        <Plus className="size-6" aria-hidden="true" />
      </span>
      <span className="font-body text-[11px] font-medium leading-none text-muted-foreground">Post</span>
    </Link>
  );
}
