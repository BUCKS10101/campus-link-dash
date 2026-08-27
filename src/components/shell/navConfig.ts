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
 * "Activity" (Ordering/Delivering restructure) points at
 * /activity/ordering, its default sub-view - but must stay lit up for
 * every /activity/* route (Delivering, either history page), not just
 * that one exact path, hence `matchPrefix` below.
 */
export interface NavItemConfig {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Overrides `href` for active-route matching only - e.g. Activity's
   * href points at one specific sub-view, but the nav item must stay
   * highlighted across the whole /activity/* family. Defaults to `href`. */
  matchPrefix?: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { key: "home", label: "Home", href: "/", icon: Home },
  { key: "activity", label: "Activity", href: "/activity/ordering", icon: Activity, matchPrefix: "/activity" },
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
