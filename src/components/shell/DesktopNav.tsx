import * as React from "react";
import { Link, useLocation } from "react-router-dom";

import { NAV_ITEMS, isNavItemActive } from "./navConfig";
import { NavItem } from "./NavItem";
import { CreateAction } from "./CreateAction";
import { AccountMenu } from "./AccountMenu";
import { PageContainer } from "./PageContainer";
import { BrandMark } from "./BrandMark";
import { NotificationBell } from "@/components/notifications/NotificationBell";

/**
 * Desktop masthead — a publication's header, not a SaaS navbar. A single
 * ink rule underneath, the relay-dot mark + wordmark, navigation as plain
 * text. No search — the previous build's search was dead (unbound state).
 * The notification bell (Phase 3C) is real: it's backed by an actual
 * notifications model, not the old static dot.
 */
export function DesktopNav() {
  const location = useLocation();
  const navRef = React.useRef<HTMLElement>(null);
  const [indicator, setIndicator] = React.useState<{ left: number; width: number } | null>(null);

  const items = NAV_ITEMS.filter((item) => item.key !== "create");

  // One shared underline that slides between items, rather than each
  // NavItem popping its own underline in and out - the continuity is the
  // point (transform/width only, never top/left, so this stays cheap).
  React.useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) {
        setIndicator(null);
        return;
      }
      setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    };

    measure();

    // A window resize (or a font/zoom change) can shift each NavItem's
    // offsetLeft/offsetWidth without touching the route, so the pathname
    // dependency alone left the indicator pinned to stale coordinates
    // until the next navigation. ResizeObserver on the nav itself catches
    // that, plus any width change from the nav's own content reflowing.
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 hidden border-b-2 border-foreground bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:block">
      <PageContainer className="flex h-[68px] items-center gap-9">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <BrandMark size={26} />
          <span className="font-display text-[26px] leading-none text-foreground">CampusLink</span>
        </Link>

        <nav ref={navRef} aria-label="Primary" className="relative flex items-center gap-7">
          {items.map((item) => (
            <NavItem
              key={item.key}
              item={item}
              variant="desktop"
              active={isNavItemActive(location.pathname, item.href)}
            />
          ))}
          {indicator && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-[1px] h-[2px] bg-primary transition-[transform,width] duration-base ease-emphasized"
              style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
            />
          )}
        </nav>

        <div className="ml-auto flex items-center gap-5">
          <NotificationBell />
          <CreateAction href="/post-request" variant="desktop" />
          <AccountMenu />
        </div>
      </PageContainer>
    </header>
  );
}
