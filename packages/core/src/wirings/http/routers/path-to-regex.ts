import { match, MatchFunction } from 'path-to-regexp'
import { MatchResult, Router } from './http-router.js'
import { HTTPMethod } from '../http.types.js'
import { pikkuState } from '../../../pikku-state.js'
import { CorePikkuMiddleware } from '../../../types/core.types.js'

interface CompiledRoute {
  matcher: MatchFunction<Partial<Record<string, string | string[]>>>
  route: string
  middleware: CorePikkuMiddleware[]
}

interface StaticRoute {
  route: string
  middleware: CorePikkuMiddleware[]
}

export class PathToRegexRouter implements Router {
  private compiledRoutes: Map<HTTPMethod, Map<string, CompiledRoute>> =
    new Map()
  private staticRoutes: Map<HTTPMethod, Map<string, StaticRoute>> = new Map()
  private precompiledMiddleware: Map<string, CorePikkuMiddleware[]> = new Map()
  private isInitialized = false

  public initialize() {
    const routes = pikkuState('http', 'routes')
    const channelRoutes = pikkuState('channel', 'channels')
    const middlewareMap = pikkuState('http', 'middleware')

    // Precompile middleware lookups
    for (const [middlewareRoute, middlewareArray] of middlewareMap.entries()) {
      this.precompiledMiddleware.set(middlewareRoute, middlewareArray)
    }

    // Helper function to compile routes for a given method
    const compileRoutesForMethod = (
      method: HTTPMethod,
      routeEntries: Iterable<[string, any]>
    ) => {
      const methodCompiledRoutes =
        this.compiledRoutes.get(method) || new Map<string, CompiledRoute>()
      const methodStaticRoutes =
        this.staticRoutes.get(method) || new Map<string, StaticRoute>()

      for (const [routePath] of routeEntries) {
        // Normalize route path - ensure it starts with /
        const normalizedRoutePath = routePath.startsWith('/')
          ? routePath
          : `/${routePath}`

        // Check if route is static (no parameters or wildcards)
        const isStaticRoute = !/\*|:/.test(normalizedRoutePath)

        // Precompute middleware for this route
        const routeMiddleware: CorePikkuMiddleware[] = []

        // Add global middleware (*)
        const globalMiddleware = this.precompiledMiddleware.get('*')
        if (globalMiddleware) {
          routeMiddleware.push(...globalMiddleware)
        }

        // Add route-specific middleware
        for (const [
          middlewareRoute,
          middlewareArray,
        ] of this.precompiledMiddleware.entries()) {
          if (middlewareRoute !== '*') {
            // Use regex test for pattern matching
            try {
              if (new RegExp(middlewareRoute).test(normalizedRoutePath)) {
                routeMiddleware.push(...middlewareArray)
              }
            } catch {
              // If regex is invalid, do exact match
              if (middlewareRoute === normalizedRoutePath) {
                routeMiddleware.push(...middlewareArray)
              }
            }
          }
        }

        if (isStaticRoute) {
          // Store static routes for O(1) lookup
          methodStaticRoutes.set(normalizedRoutePath, {
            route: routePath, // Keep the original route path for lookup in pikkuState
            middleware: routeMiddleware,
          })
        } else {
          // Compile dynamic routes with path-to-regexp
          const matcher = match(normalizedRoutePath, {
            decode: decodeURIComponent,
          })

          methodCompiledRoutes.set(normalizedRoutePath, {
            matcher,
            route: routePath, // Keep the original route path for lookup in pikkuState
            middleware: routeMiddleware,
          })
        }
      }

      this.compiledRoutes.set(method, methodCompiledRoutes)
      this.staticRoutes.set(method, methodStaticRoutes)
    }

    // Precompile all HTTP route matchers
    for (const [method, routeMap] of routes.entries()) {
      compileRoutesForMethod(method, routeMap.entries())
    }

    // Precompile all channel route matchers (treating them as GET routes for WebSocket upgrades)
    const channelRoutesArray: Array<[string, any]> = Array.from(
      channelRoutes.entries()
    ).map(([, channel]) => [channel.route, channel])
    compileRoutesForMethod('get', channelRoutesArray)

    this.isInitialized = true
  }

  match(method: HTTPMethod, path: string): MatchResult {
    if (!this.isInitialized) {
      this.initialize()
    }

    // Normalize path - ensure it starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    // First, try static routes for O(1) lookup
    const methodStaticRoutes = this.staticRoutes.get(method)
    if (methodStaticRoutes) {
      const staticRoute = methodStaticRoutes.get(normalizedPath)
      if (staticRoute) {
        return {
          route: staticRoute.route,
          params: {},
          middleware: staticRoute.middleware,
        }
      }
    }

    // If no static route matched, try dynamic routes
    const methodRoutes = this.compiledRoutes.get(method)
    if (!methodRoutes) {
      return null
    }

    // Try each compiled route for this method
    for (const [, compiledRoute] of methodRoutes.entries()) {
      const result = compiledRoute.matcher(normalizedPath)
      if (result) {
        return {
          route: compiledRoute.route,
          params: result.params,
          middleware: compiledRoute.middleware,
        }
      }
    }

    return null
  }
}
