import type { InspectorState } from '../types.js'

export const serializePermissionsGroupsMeta = (state: InspectorState) => {
  return {
    definitions: state.permissions.definitions,
  }
}
