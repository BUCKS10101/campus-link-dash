import { Navigate, useLocation } from 'react-router-dom'

/**
 * `/my-orders` and bare `/activity` both redirect here, to
 * `/activity/ordering` - the Ordering/Delivering split's default view.
 * Preserves the query string (a notification's `?order=<id>` deep-link)
 * so an existing bookmark or notification click-through still lands the
 * user on the right order, not just the right page.
 */
export function ActivityRedirect() {
  const location = useLocation()
  return <Navigate to={`/activity/ordering${location.search}`} replace />
}
