import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * Ordering / Delivering switch shown at the top of every Activity page -
 * this is the primary way to move between the two role contexts on
 * mobile (no hover, no dropdown) and a convenient secondary way on
 * desktop alongside the masthead's Activity dropdown. Two plain links,
 * not a JS-driven tab widget - each destination is a real route, so this
 * works identically with keyboard navigation, direct URLs, and back/
 * forward. Reuses the same rounded-chip button style Home.tsx's own
 * filter chips already use - no new visual language.
 */
export function ActivityRoleSwitch({ active }: { active: 'ordering' | 'delivering' }) {
  const location = useLocation()

  const items: { key: 'ordering' | 'delivering'; label: string; href: string }[] = [
    { key: 'ordering', label: 'Ordering', href: '/activity/ordering' },
    { key: 'delivering', label: 'Delivering', href: '/activity/delivering' },
  ]

  return (
    <nav aria-label="Activity view" className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const isActive = active === item.key
        return (
          <Link
            key={item.key}
            to={item.href + (location.search || '')}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-full border px-4 py-2 font-body text-body-sm font-semibold transition-colors duration-fast ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-transparent text-foreground hover:border-border-strong',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
