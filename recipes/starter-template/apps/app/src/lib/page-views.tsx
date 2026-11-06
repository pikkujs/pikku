import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useAnalytics } from '@/lib/product'

/**
 * Records a page view on every route change. The matched route id, not the
 * pathname: a pathname carries every id in the app into a queryable column.
 */
export const PageViews = () => {
  const analytics = useAnalytics()
  const path = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? '/',
  })
  useEffect(() => {
    analytics.event('page_viewed', { path })
  }, [analytics, path])
  return null
}
