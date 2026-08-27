import { Home, Activity, Users, Plus, User, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for primary navigation — shared by DesktopNav and
 * MobileNav so the two surfaces can never disagree about labels, icons, or
 * destinations.
 *
 * IA: Home / Activity / Friends / Create / Profile. Chat is deliberately
 * absent — it belongs to the order it's about, opened as a contextual
 * panel, not a permanent destination. Friends is a first-class destination
 * (not buried inside Profile); "create" sits in the middle of this array
 * on purpose so the mobile tab bar's FAB renders centered between two
 * items on each side, while DesktopNav filters it out into its own CTA.
 *
 * "Activity" has no dedicated page yet. It points at /my-orders, the
 * closest existing view of a user's own requests and deliveries, rather
 * than inventing a route with nothing behind it.
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
  { key: "friends", label: "Friends", href: "/friends", icon: Users },
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
