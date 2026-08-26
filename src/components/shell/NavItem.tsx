import * as React from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import type { NavItemConfig } from "./navConfig";

export interface NavItemProps {
  item: NavItemConfig;
  active: boolean;
  variant: "desktop" | "mobile";
  /** A small unread dot over the icon - mobile only, currently just Activity (Phase 3C). */
  showUnreadDot?: boolean;
}

/**
 * One nav destination, shared by both surfaces.
 *
 * Desktop is text-only — no icons, no pills. "Navigation as text" is
 * part of Counter's whole point: the masthead reads like a publication's
 * section list, not an app toolbar. Mobile keeps icons, since a bottom
 * tab bar without them is genuinely harder to scan at a glance while
 * walking.
 */
export function NavItem({ item, active, variant, showUnreadDot = false }: NavItemProps) {
  const Icon = item.icon;

  if (variant === "desktop") {
    return (
      <Link
        to={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative py-2 font-body text-body-sm font-semibold",
          "transition-colors duration-fast ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <Link
      to={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-w-[56px] flex-col items-center justify-center gap-1 py-1.5",
        "transition-colors duration-fast ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span className="relative inline-flex">
        <Icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.25 : 1.75} />
        {showUnreadDot && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
        )}
      </span>
      <span className="font-body text-[11px] font-medium leading-none">
        {item.label}
        {showUnreadDot && <span className="sr-only"> (unread)</span>}
      </span>
    </Link>
  );
}
