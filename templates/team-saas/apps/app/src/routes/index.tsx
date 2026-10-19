import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * ROUTE CONVENTION: `/api` is the API, `/app` is the signed-in application, and
 * `/` is the marketing homepage. The starter ships no homepage, so `/` forwards to
 * the app — it decides nothing about sessions; /app's own gate sends a signed-out
 * visitor on to /app/login. Redirect at the router level so it runs during SSR (and
 * every navigation), instead of a client-only effect that leaves `/` blank until
 * hydration.
 *
 * Building a landing page? Replace this route with a component. Nothing else has
 * to change — /app keeps working and stays gated.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/app' })
  },
})
