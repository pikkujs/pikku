import { pikkuState } from '../pikku-state.js'
import { httpRouter } from '../wirings/http/routers/http-router.js'
import type { HTTPWiringMeta } from '../wirings/http/http.types.js'
import { ensureFunction } from './registered-function.js'
import type { MountHandle } from './types.js'

export type HTTPRouteWiring = {
  func?: unknown
  auth?: boolean
  middleware?: unknown[]
  permissions?: unknown
  tags?: string[]
  sse?: boolean
  streamProtocol?: string
  [key: string]: unknown
}

export type HTTPMountedRoute = {
  meta: HTTPWiringMeta
  wiring?: HTTPRouteWiring
}

export type HTTPRoutesMount = {
  routes: HTTPMountedRoute[]
  packageName?: string
}

const routeShape = (route: string): string =>
  (route.startsWith('/') ? route : `/${route}`).replace(/:[^/]+/g, ':')

export const mountHTTPRoutes = ({
  routes,
  packageName,
}: HTTPRoutesMount): MountHandle => {
  const metaTable = pikkuState(null, 'http', 'meta')
  const wiringTable = pikkuState(null, 'http', 'routes')

  const seen = new Set<string>()
  for (const { meta } of routes) {
    const label = `${meta.method.toUpperCase()} ${meta.route}`
    const key = `${meta.method} ${routeShape(meta.route)}`
    if (seen.has(key)) {
      throw new Error(`HTTP route "${label}" is mounted twice`)
    }
    seen.add(key)
    for (const existing of Object.keys(metaTable[meta.method] ?? {})) {
      if (routeShape(existing) === routeShape(meta.route)) {
        throw new Error(
          `HTTP route "${label}" collides with the existing route "${meta.method.toUpperCase()} ${existing}"`
        )
      }
    }
  }

  const functionRestores: Array<() => void> = []
  const added: Array<{ meta: HTTPWiringMeta; entry: unknown }> = []
  const removeRoutes = () => {
    for (const { meta, entry } of added) {
      if (wiringTable.get(meta.method)?.get(meta.route) === entry) {
        delete metaTable[meta.method][meta.route]
        wiringTable.get(meta.method)!.delete(meta.route)
        if (wiringTable.get(meta.method)!.size === 0) {
          wiringTable.delete(meta.method)
        }
      }
    }
    added.length = 0
  }
  const restoreFunctions = () => {
    for (const restore of functionRestores.splice(0).reverse()) restore()
  }
  try {
    for (const { meta, wiring } of routes) {
      const label = `${meta.method.toUpperCase()} ${meta.route}`
      const stamped: HTTPWiringMeta = {
        ...meta,
        packageName: packageName ?? meta.packageName,
      }
      functionRestores.push(
        ensureFunction(
          'HTTP route',
          label,
          meta.pikkuFuncId,
          stamped.packageName ?? null,
          wiring?.func
        )
      )
      const { func: _func, ...rest } = wiring ?? {}
      const entry = { ...rest, route: meta.route, method: meta.method }
      metaTable[meta.method][meta.route] = stamped
      if (!wiringTable.has(meta.method)) wiringTable.set(meta.method, new Map())
      wiringTable.get(meta.method)!.set(meta.route, entry as never)
      added.push({ meta: stamped, entry })
    }
  } catch (error) {
    removeRoutes()
    restoreFunctions()
    httpRouter.reset()
    throw error
  }
  httpRouter.reset()

  const labels = added.map(
    ({ meta }) => `${meta.method.toUpperCase()} ${meta.route}`
  )
  let unmounted = false
  return {
    added: labels,
    unmount: () => {
      if (unmounted) return labels
      unmounted = true
      removeRoutes()
      restoreFunctions()
      httpRouter.reset()
      return labels
    },
  }
}
