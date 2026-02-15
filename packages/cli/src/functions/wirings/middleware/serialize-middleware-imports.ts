import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type {
  InspectorMiddlewareState,
  InspectorHTTPState,
  InspectorState,
  MiddlewareGroupMeta,
} from '@pikku/inspector'

const collectFactories = (
  groupMap: Map<string, MiddlewareGroupMeta>,
  outputPath: string,
  packageMappings: Record<string, string>
): Map<string, { exportName: string; filePath: string }> => {
  const factories = new Map<string, { exportName: string; filePath: string }>()
  for (const [, groupMeta] of groupMap.entries()) {
    if (groupMeta.exportName && groupMeta.isFactory) {
      const filePath = getFileImportRelativePath(
        outputPath,
        groupMeta.sourceFile,
        packageMappings
      )
      factories.set(groupMeta.exportName, {
        exportName: groupMeta.exportName,
        filePath,
      })
    }
  }
  return factories
}

export const serializeMiddlewareImports = (
  outputPath: string,
  middlewareState: InspectorMiddlewareState,
  httpState: InspectorHTTPState,
  packageMappings: Record<string, string> = {},
  fullState?: InspectorState
) => {
  const serializedImports: string[] = []
  const serializedFactoryCalls: string[] = []

  const httpFactories = collectFactories(
    httpState.routeMiddleware,
    outputPath,
    packageMappings
  )
  const tagFactories = collectFactories(
    middlewareState.tagMiddleware,
    outputPath,
    packageMappings
  )

  const channelMiddlewareFactories = fullState
    ? collectFactories(
        fullState.channelMiddleware.tagMiddleware,
        outputPath,
        packageMappings
      )
    : new Map()

  const allFactories = new Map([
    ...httpFactories,
    ...tagFactories,
    ...channelMiddlewareFactories,
  ])

  if (allFactories.size > 0) {
    serializedImports.push(
      '/* Call middleware group factories to register at module evaluation */'
    )

    for (const [exportName, { filePath }] of allFactories) {
      serializedImports.push(`import { ${exportName} } from '${filePath}'`)
    }

    for (const [exportName] of allFactories) {
      serializedFactoryCalls.push(`${exportName}()`)
    }
  }

  return [...serializedImports, ...serializedFactoryCalls].join('\n')
}
