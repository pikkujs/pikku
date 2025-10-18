import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type {
  InspectorPermissionState,
  InspectorHTTPState,
  InspectorState,
} from '@pikku/inspector'

export const serializePermissionsImports = (
  outputPath: string,
  permissionsState: InspectorPermissionState,
  httpState: InspectorHTTPState,
  packageMappings: Record<string, string> = {},
  fullState?: InspectorState
) => {
  const serializedImports: string[] = []
  const serializedFactoryCalls: string[] = []

  // Collect factory imports and calls for HTTP permission groups
  const httpFactories = new Map<
    string,
    { exportName: string; filePath: string }
  >()
  for (const [, groupMeta] of httpState.routePermissions.entries()) {
    if (groupMeta.exportName && groupMeta.isFactory) {
      const filePath = getFileImportRelativePath(
        outputPath,
        groupMeta.sourceFile,
        packageMappings
      )
      httpFactories.set(groupMeta.exportName, {
        exportName: groupMeta.exportName,
        filePath,
      })
    }
  }

  // Collect factory imports and calls for tag permission groups
  const tagFactories = new Map<
    string,
    { exportName: string; filePath: string }
  >()
  for (const [, groupMeta] of permissionsState.tagPermissions.entries()) {
    if (groupMeta.exportName && groupMeta.isFactory) {
      const filePath = getFileImportRelativePath(
        outputPath,
        groupMeta.sourceFile,
        packageMappings
      )
      tagFactories.set(groupMeta.exportName, {
        exportName: groupMeta.exportName,
        filePath,
      })
    }
  }

  // Combine all factories and deduplicate by exportName (same factory might be used in multiple groups)
  const allFactories = new Map([...httpFactories, ...tagFactories])

  // Add factory imports and calls
  if (allFactories.size > 0) {
    serializedImports.push(
      '/* Call permission group factories to register at module evaluation */'
    )

    // Import factories
    for (const [exportName, { filePath }] of allFactories) {
      serializedImports.push(`import { ${exportName} } from '${filePath}'`)
    }

    // Call factories
    for (const [exportName] of allFactories) {
      serializedFactoryCalls.push(`${exportName}()`)
    }
  }

  // Return combined output
  return [...serializedImports, ...serializedFactoryCalls].join('\n')
}
