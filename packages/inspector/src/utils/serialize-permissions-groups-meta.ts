import type { InspectorState } from '../types.js'

export const serializePermissionsGroupsMeta = (state: InspectorState) => {
  const httpGroups: Record<string, any> = {}
  for (const [pattern, meta] of state.http.routePermissions.entries()) {
    httpGroups[pattern] = {
      exportName: meta.exportName,
      sourceFile: meta.sourceFile,
      position: meta.position,
      services: meta.services,
      count: meta.count,
      instanceIds: meta.instanceIds,
      isFactory: meta.isFactory,
    }
  }

  const tagGroups: Record<string, any> = {}
  for (const [tag, meta] of state.permissions.tagPermissions.entries()) {
    tagGroups[tag] = {
      exportName: meta.exportName,
      sourceFile: meta.sourceFile,
      position: meta.position,
      services: meta.services,
      count: meta.count,
      instanceIds: meta.instanceIds,
      isFactory: meta.isFactory,
    }
  }

  return {
    definitions: state.permissions.definitions,
    httpGroups,
    tagGroups,
  }
}
