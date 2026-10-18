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
 * exported zero-argument factory is imported by name and called. Two files can
 * export a factory with the same name, so each is imported under its own alias.
 */
export const serializePermissionsImports = (
  outputPath: string,
  permissionsState: InspectorPermissionState,
  _httpState: InspectorHTTPState,
  packageMappings: Record<string, string> = {},
  _fullState?: InspectorState
) => {
  const sideEffectImports = new Set<string>()
  const factories = new Map<string, { exportName: string; filePath: string }>()

  for (const registration of permissionsState.global ?? []) {
    const filePath = getFileImportRelativePath(
      outputPath,
      registration.sourceFile,
      packageMappings
    )
    if (registration.exportName) {
      factories.set(`${filePath}\0${registration.exportName}`, {
        exportName: registration.exportName,
        filePath,
      })
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
    const aliased = [...factories.values()].map((factory, index) => ({
      ...factory,
      alias: `globalPermissionFactory${index}`,
    }))
    for (const { exportName, filePath, alias } of aliased) {
      lines.push(`import { ${exportName} as ${alias} } from '${filePath}'`)
    }
    for (const { alias } of aliased) {
      lines.push(`${alias}()`)
    }
  }
  return lines.join('\n')
}
