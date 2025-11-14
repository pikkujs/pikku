import type { InspectorState } from '@pikku/inspector'

/**
 * Generates the middleware groups metadata that stores metadata about
 * tag-based and HTTP middleware groups for visualization and inspection.
 *
 * This includes services, middleware count, factory status, etc.
 */
export const serializeMiddlewareGroupsMeta = (state: InspectorState) => {
  // Serialize HTTP middleware groups metadata
  const httpGroups: Record<string, any> = {}
  for (const [pattern, meta] of state.http.routeMiddleware.entries()) {
    httpGroups[pattern] = {
      exportName: meta.exportName,
      sourceFile: meta.sourceFile,
      position: meta.position,
      services: meta.services,
      middlewareCount: meta.middlewareCount,
      isFactory: meta.isFactory,
    }
  }

  // Serialize tag middleware groups metadata
  const tagGroups: Record<string, any> = {}
  for (const [tag, meta] of state.middleware.tagMiddleware.entries()) {
    tagGroups[tag] = {
      exportName: meta.exportName,
      sourceFile: meta.sourceFile,
      position: meta.position,
      services: meta.services,
      middlewareCount: meta.middlewareCount,
      isFactory: meta.isFactory,
    }
  }

  return {
    httpGroups,
    tagGroups,
  }
}
