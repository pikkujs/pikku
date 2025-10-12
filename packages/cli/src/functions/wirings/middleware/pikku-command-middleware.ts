import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMiddlewareImports } from './serialize-middleware-imports.js'
import { serializeMiddlewareGroupsMeta } from './serialize-middleware-groups-meta.js'
import path from 'path'

export const pikkuMiddleware: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { middleware } = state
    const { middlewareFile, packageMappings, outDir } = config

    let filesGenerated = false

    // Count exportable middleware (filter out inline middleware)
    const exportableMiddleware = Object.entries(middleware.meta).filter(
      ([, meta]) => meta.exportedName !== null
    )

    // Generate individual middleware imports file
    if (exportableMiddleware.length > 0) {
      await writeFileInDir(
        logger,
        middlewareFile,
        serializeMiddlewareImports(middlewareFile, middleware, packageMappings)
      )
      filesGenerated = true
    }

    // Generate middleware groups metadata file
    const hasHTTPGroups = state.http.routeMiddleware.size > 0
    const hasTagGroups = state.middleware.tagMiddleware.size > 0

    if (hasHTTPGroups || hasTagGroups) {
      const middlewareGroupsMetaFile = path.join(
        outDir,
        'middleware',
        'pikku-middleware-groups-meta.gen.ts'
      )
      await writeFileInDir(
        logger,
        middlewareGroupsMetaFile,
        serializeMiddlewareGroupsMeta(state)
      )
      filesGenerated = true
    }

    return filesGenerated
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Serializing Pikku middleware',
      commandEnd: 'Serialized Pikku middleware',
      skipCondition: false,
      skipMessage: '',
    }),
  ],
})
