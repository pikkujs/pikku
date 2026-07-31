import type { MatchFunction } from 'path-to-regexp'
import { match } from 'path-to-regexp'
import type { MatchResult, Router } from './http-router.js'
import type { HTTPMethod } from '../http.types.js'
import { pikkuState } from '../../../pikku-state.js'

interface CompiledRoute {
  matcher: MatchFunction<Partial<Record<string, string | string[]>>>
  route: string
}

interface StaticRoute {
  route: string
}

export class PathToRegexRouter implements Router {
  private compiledRoutes: Map<HTTPMethod, Map<string, CompiledRoute>> =
    new Map()
  private staticRoutes: Map<HTTPMethod, Map<string, StaticRoute>> = new Map()
  private isInitialized = false

  public reset() {
    this.compiledRoutes = new Map()
    this.staticRoutes = new Map()
    this.isInitialized = false
  }

  public initialize() {
    const routes = pikkuState(null, 'http', 'routes')
    const channelRoutes = pikkuState(null, 'channel', 'channels')

    const compileRoutesForMethod = (
      method: HTTPMethod,
      routeEntries: Iterable<[string, any]>
    ) => {
      const methodCompiledRoutes =
        this.compiledRoutes.get(method) || new Map<string, CompiledRoute>()
      const methodStaticRoutes =
        this.staticRoutes.get(method) || new Map<string, StaticRoute>()

      for (const [routePath] of routeEntries) {
        const normalizedRoutePath = routePath.startsWith('/')
          ? routePath
          : `/${routePath}`

        const isStaticRoute = !/\*|:/.test(normalizedRoutePath)

        if (isStaticRoute) {
          methodStaticRoutes.set(normalizedRoutePath, {
            route: routePath,
          })
        } else {
          const matcher = match(normalizedRoutePath, {
            decode: decodeURIComponent,
          })

          methodCompiledRoutes.set(normalizedRoutePath, {
            matcher,
            route: routePath,
          })
        }
      }

      this.compiledRoutes.set(method, methodCompiledRoutes)
      this.staticRoutes.set(method, methodStaticRoutes)
    }

    for (const [method, routeMap] of routes.entries()) {
      compileRoutesForMethod(method, routeMap.entries())
    }

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

    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    const methodStaticRoutes = this.staticRoutes.get(method)
    if (methodStaticRoutes) {
      const staticRoute = methodStaticRoutes.get(normalizedPath)
      if (staticRoute) {
        return {
          route: staticRoute.route,
          params: {},
        }
      }
    }

    const methodRoutes = this.compiledRoutes.get(method)
    if (!methodRoutes) {
      return null
    }

    for (const [, compiledRoute] of methodRoutes.entries()) {
      const result = compiledRoute.matcher(normalizedPath)
      if (result) {
        return {
          route: compiledRoute.route,
          params: result.params,
        }
      }
    }

    return null
  }
}
