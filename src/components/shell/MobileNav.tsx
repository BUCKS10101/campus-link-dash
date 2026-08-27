import * as React from "react";
import { useLocation } from "react-router-dom";

import { NAV_ITEMS, isNavItemActive } from "./navConfig";
import { NavItem } from "./NavItem";
import { CreateAction } from "./CreateAction";
import { useNotifications } from "@/hooks/useNotifications";

/**
 * Bottom tab bar — the primary interaction surface on mobile. Fixed,
 * thumb-reachable, and safe-area aware so it never sits under a phone's
 * home-indicator gesture strip.
 */
export function MobileNav() {
  const location = useLocation();
  const items = NAV_ITEMS;
  const { unreadCount } = useNotifications();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-16 max-w-layout items-stretch justify-around px-2">
        {items.map((item) => {
          const active = isNavItemActive(location.pathname, item.matchPrefix ?? item.href);
          if (item.key === "create") {
            return <CreateAction key={item.key} href={item.href} variant="mobile" active={active} />;
          }
          return (
            <NavItem
              key={item.key}
              item={item}
              variant="mobile"
              active={active}
              showUnreadDot={item.key === "activity" && unreadCount > 0}
            />
          );
        })}
      </div>
    </nav>
  );
}
