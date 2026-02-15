import type { InspectorState, MiddlewareGroupMeta } from '@pikku/inspector'

const serializeGroupMap = (
  groupMap: Map<string, MiddlewareGroupMeta>
): Record<string, any> => {
  const result: Record<string, any> = {}
  for (const [key, meta] of groupMap.entries()) {
    result[key] = {
      exportName: meta.exportName,
      sourceFile: meta.sourceFile,
      position: meta.position,
      services: meta.services,
      count: meta.count,
      instanceIds: meta.instanceIds,
      isFactory: meta.isFactory,
    }
  }
  return result
}

export const serializeMiddlewareGroupsMeta = (state: InspectorState) => {
  return {
    definitions: state.middleware.definitions,
    instances: state.middleware.instances,
    httpGroups: serializeGroupMap(state.http.routeMiddleware),
    tagGroups: serializeGroupMap(state.middleware.tagMiddleware),
    channelMiddleware: {
      definitions: state.channelMiddleware.definitions,
      instances: state.channelMiddleware.instances,
      tagGroups: serializeGroupMap(state.channelMiddleware.tagMiddleware),
    },
  }
}
