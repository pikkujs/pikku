import { defineHTTPRoutes } from '@pikku/core/http'
import type {
  HTTPRouteContract,
  HTTPRouteMap,
  HTTPMethod,
} from '@pikku/core/http'
import { pikkuState } from '@pikku/core/internal'

import { createAuthHandler } from './auth-handler.js'
import type { AuthConfigOrFactory } from './auth-handler.js'

type AuthRoute = { method: HTTPMethod; route: string }

const AUTH_ROUTES: AuthRoute[] = [
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

function registerAuthMeta(basePath: string): void {
  const httpMeta = pikkuState(null, 'http', 'meta')
  const funcMeta = pikkuState(null, 'function', 'meta')

  for (const { method, route } of AUTH_ROUTES) {
    const fullRoute = basePath + route
    const pikkuFuncId = `authjs_${method}_${fullRoute.replace(/[^a-z0-9]/gi, '_')}`

    if (!httpMeta[method]) {
      httpMeta[method] = {}
    }
    httpMeta[method][fullRoute] = {
      pikkuFuncId,
      route: fullRoute,
      method,
    }

    funcMeta[pikkuFuncId] = {
      pikkuFuncId,
      inputSchemaName: null,
      outputSchemaName: null,
      services: { optimized: false, services: [] },
    }
  }
}

/**
 * Creates all Auth.js routes as a Pikku route contract.
 *
 * Mount via wireHTTPRoutes:
 * ```typescript
 * wireHTTPRoutes({
 *   routes: {
 *     auth: createAuthRoutes({
 *       providers: [GitHub({ clientId: '...', clientSecret: '...' })],
 *       secret: process.env.AUTH_SECRET!,
 *     }),
 *   },
 * })
 * ```
 */
export const createAuthRoutes = (
  config: AuthConfigOrFactory,
  basePath = '/auth'
): HTTPRouteContract<HTTPRouteMap> => {
  registerAuthMeta(basePath)

  const func = createAuthHandler(config)
  const routes: Record<
    string,
    { method: HTTPMethod; route: string; func: typeof func }
  > = {}
  for (const { method, route } of AUTH_ROUTES) {
    const key = `${method}_${route.replace(/[^a-z0-9]/gi, '_')}`
    routes[key] = { method, route, func }
  }

  return defineHTTPRoutes({
    auth: false,
    basePath,
    routes,
  })
}
