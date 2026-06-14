import type { HTTPMethod } from '@pikku/core/http'

export type AuthRoute = { method: HTTPMethod; route: string }

/**
 * The fixed set of Auth.js routes, relative to the configured `basePath`
 * (default `/auth`). This is the single source of truth consumed by the pikku
 * CLI's `serializeAuthGen` to emit explicit HTTP wiring — so the `/auth/*`
 * routes go through normal inspection and into the deploy manifest like any
 * other route, rather than a runtime-only side-channel.
 */
export const AUTH_ROUTES: AuthRoute[] = [
  { method: 'get', route: '/csrf' },
  { method: 'get', route: '/providers' },
  { method: 'get', route: '/session' },
  { method: 'get', route: '/signin' },
  { method: 'post', route: '/signin' },
  { method: 'post', route: '/signin/:provider' },
  { method: 'get', route: '/callback/:provider' },
  { method: 'post', route: '/callback/:provider' },
  { method: 'get', route: '/signout' },
  { method: 'post', route: '/signout' },
  { method: 'get', route: '/error' },
]
