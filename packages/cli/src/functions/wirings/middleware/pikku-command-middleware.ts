import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMiddlewareImports } from './serialize-middleware-imports.js'
import { serializeMiddlewareGroupsMeta } from './serialize-middleware-groups-meta.js'

export const pikkuMiddleware: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { middleware } = state
    const { middlewareFile, packageMappings } = config

    let filesGenerated = false

    // Check if there are any middleware groups
    const hasHTTPGroups = state.http.routeMiddleware.size > 0
    const hasTagGroups = state.middleware.tagMiddleware.size > 0

    if (hasHTTPGroups || hasTagGroups) {
      await writeFileInDir(
        logger,
        config.middlewareGroupsMetaFile,
        serializeMiddlewareGroupsMeta(state)
      )

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
