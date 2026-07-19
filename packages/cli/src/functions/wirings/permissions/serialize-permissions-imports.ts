import type {
  InspectorPermissionState,
  InspectorHTTPState,
  InspectorState,
} from '@pikku/inspector'

/**
 * Permissions are function-scoped only — they are imported and passed inline
 * wherever a function declares them, so there are no permission groups to
 * register at module evaluation. This generator therefore emits nothing.
 */
export const serializePermissionsImports = (
  _outputPath: string,
  _permissionsState: InspectorPermissionState,
  _httpState: InspectorHTTPState,
  _packageMappings: Record<string, string> = {},
  _fullState?: InspectorState
) => {
  return ''
}
