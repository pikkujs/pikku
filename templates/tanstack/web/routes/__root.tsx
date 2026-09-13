import { useEffect } from 'react'
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import { AppHeader } from '../components/AppHeader'
import { recordEvent, startAnalytics } from '../lib/analytics'
import styles from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Pikku todos' },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  shellComponent: RootDocument,
})

function RootDocument() {
  // The matched route's pattern, not the resolved URL: a path carries ids, and
  // an id in an analytics prop is both a cardinality problem and personal data
  // in a store that has no business holding it.
  const path = useRouterState({
    select: (state) => state.matches.at(-1)?.routeId ?? '/',
  })

  useEffect(() => {
    startAnalytics()
  }, [])

  useEffect(() => {
    recordEvent({ name: 'page_viewed', path })
  }, [path])

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="shell">
          <AppHeader />
          <Outlet />
        </div>
        <Scripts />
      </body>
    </html>
  )
}
