import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type {
  InspectorMiddlewareState,
  InspectorHTTPState,
} from '@pikku/inspector'

export const serializeMiddlewareImports = (
  outputPath: string,
  middlewareState: InspectorMiddlewareState,
  httpState: InspectorHTTPState,
  packageMappings: Record<string, string> = {}
) => {
  const serializedImports: string[] = []
  const serializedFactoryCalls: string[] = []

  // Collect factory imports and calls for HTTP middleware groups
  const httpFactories = new Map<
    string,
    { exportName: string; filePath: string }
  >()
  for (const [, groupMeta] of httpState.routeMiddleware.entries()) {
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

  // Collect factory imports and calls for tag middleware groups
  const tagFactories = new Map<
    string,
    { exportName: string; filePath: string }
  >()
  for (const [, groupMeta] of middlewareState.tagMiddleware.entries()) {
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
      '/* Call middleware group factories to register at module evaluation */'
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
