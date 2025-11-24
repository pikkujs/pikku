import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMiddlewareImports } from './serialize-middleware-imports.js'
import { serializeMiddlewareGroupsMeta } from './serialize-middleware-groups-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuMiddleware: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { middleware } = state
    const { middlewareFile, packageMappings, schema } = config

    let filesGenerated = false

    // Check if there are any middleware groups
    const hasHTTPGroups = state.http.routeMiddleware.size > 0
    const hasTagGroups = state.middleware.tagMiddleware.size > 0

    if (hasHTTPGroups || hasTagGroups) {
      const metaData = serializeMiddlewareGroupsMeta(state)

      // Write JSON file
      await writeFileInDir(
        logger,
        config.middlewareGroupsMetaJsonFile,
        JSON.stringify(metaData, null, 2)
      )

      // Calculate relative path from TS file to JSON file
      const jsonImportPath = getFileImportRelativePath(
        config.middlewareGroupsMetaFile,
        config.middlewareGroupsMetaJsonFile,
        packageMappings
      )

      // Write TypeScript file that imports JSON
      const supportsImportAttributes = schema?.supportsImportAttributes ?? false
      const importStatement = supportsImportAttributes
        ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
        : `import metaData from '${jsonImportPath}'`

      const tsContent = `import { pikkuState } from '@pikku/core'
${importStatement}

// HTTP middleware groups metadata
if (metaData.httpGroups && Object.keys(metaData.httpGroups).length > 0) {
  pikkuState(null, 'middleware', 'httpGroupMeta', metaData.httpGroups)
}

// Tag middleware groups metadata
if (metaData.tagGroups && Object.keys(metaData.tagGroups).length > 0) {
  pikkuState(null, 'middleware', 'tagGroupMeta', metaData.tagGroups)
}
`

      await writeFileInDir(logger, config.middlewareGroupsMetaFile, tsContent)

      // Always generate middleware imports file when groups exist (even if empty)
      await writeFileInDir(
        logger,
        middlewareFile,
        serializeMiddlewareImports(
          middlewareFile,
          middleware,
          state.http,
          packageMappings
        )
      )

      filesGenerated = true
    }

    return filesGenerated
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Serializing Pikku middleware',
      commandEnd: 'Serialized Pikku middleware',
    }),
  ],
})
