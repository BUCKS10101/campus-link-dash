import { Home, Activity, Plus, User, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for primary navigation — shared by DesktopNav and
 * MobileNav so the two surfaces can never disagree about labels, icons, or
 * destinations.
 *
 * IA per the Phase 2 spec: Home / Activity / Create / Profile. Chat is
 * deliberately absent — it belongs to the order it's about, opened as a
 * contextual panel, not a permanent destination.
 *
 * "Activity" has no dedicated page yet (that's 2C+ Activity work). It
 * points at /my-orders, the closest existing view of a user's own
 * requests and deliveries, rather than inventing a route with nothing
 * behind it.
 */
export interface NavItemConfig {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { key: "home", label: "Home", href: "/", icon: Home },
  { key: "activity", label: "Activity", href: "/my-orders", icon: Activity },
  { key: "create", label: "Post", href: "/post-request", icon: Plus },
  { key: "profile", label: "Profile", href: "/profile", icon: User },
];

/**
 * A route is "active" for a nav item if it matches exactly, except Home,
 * which only matches the literal root — otherwise every other route would
 * also light up Home as a shared prefix ("/" is a prefix of everything).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
