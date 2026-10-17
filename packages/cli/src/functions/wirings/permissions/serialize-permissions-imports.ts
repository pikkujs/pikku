import type {
  InspectorPermissionState,
  InspectorHTTPState,
  InspectorState,
} from '@pikku/inspector'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

/**
 * Imports every file that calls `addGlobalPermission`, so the global gate is
 * registered wherever the bootstrap runs.
 *
 * A function's own permissions are imported and passed inline wherever it
 * declares them, and need nothing here. A global permission is different: it
 * registers at module evaluation, and nothing else is guaranteed to import its
 * file. Without this a file whose only job is `addGlobalPermission([...])` was
 * never loaded, and every function ran without the gate. A call inside an
 * exported zero-argument factory is imported by name and called.
 */
export const serializePermissionsImports = (
  outputPath: string,
  permissionsState: InspectorPermissionState,
  _httpState: InspectorHTTPState,
  packageMappings: Record<string, string> = {},
  _fullState?: InspectorState
) => {
  const sideEffectImports = new Set<string>()
  const factories = new Map<string, string>()

  for (const registration of permissionsState.global ?? []) {
    const filePath = getFileImportRelativePath(
      outputPath,
      registration.sourceFile,
      packageMappings
    )
    if (registration.exportName) {
      factories.set(registration.exportName, filePath)
    } else {
      sideEffectImports.add(filePath)
    }
  }

  const lines: string[] = []
  if (sideEffectImports.size > 0) {
    lines.push('/* Side-effect imports for addGlobalPermission calls */')
    for (const filePath of sideEffectImports) {
      lines.push(`import '${filePath}'`)
    }
  }
  if (factories.size > 0) {
    lines.push('/* Call global permission factories to register them */')
    for (const [exportName, filePath] of factories) {
      lines.push(`import { ${exportName} } from '${filePath}'`)
    }
    for (const exportName of factories.keys()) {
      lines.push(`${exportName}()`)
    }
  }
  return lines.join('\n')
}
