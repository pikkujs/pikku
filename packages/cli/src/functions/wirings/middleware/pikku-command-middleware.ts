import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMiddlewareImports } from './serialize-middleware-imports.js'

export const pikkuMiddleware = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { middleware } = state
    const { middlewareFile, packageMappings } = config

    let filesGenerated = false

    const hasHTTPGroups = state.http.routeMiddleware.size > 0
    const hasTagGroups = state.middleware.tagMiddleware.size > 0
    const hasDefinitions = Object.keys(state.middleware.definitions).length > 0
    const hasChannelMiddleware =
      state.channelMiddleware.tagMiddleware.size > 0 ||
      Object.keys(state.channelMiddleware.definitions).length > 0

    if (
      hasHTTPGroups ||
      hasTagGroups ||
      hasDefinitions ||
      hasChannelMiddleware
    ) {
      const metaData = state.middlewareGroupsMeta

      await writeFileInDir(
        logger,
        config.middlewareGroupsMetaJsonFile,
        JSON.stringify(metaData, null, 2)
      )

      await writeFileInDir(
        logger,
        middlewareFile,
        serializeMiddlewareImports(
          middlewareFile,
          middleware,
          state.http,
          packageMappings,
          state
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
