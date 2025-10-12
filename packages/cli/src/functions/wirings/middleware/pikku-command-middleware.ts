import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeMiddlewareImports } from './serialize-middleware-imports.js'

export const pikkuMiddleware: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const { middleware } = await getInspectorState()
    const { middlewareFile, packageMappings } = config

    // Count exportable middleware (filter out inline middleware)
    const exportableMiddleware = Object.entries(middleware.meta).filter(
      ([, meta]) => meta.exportedName !== null
    )

    // Only generate file if there are exportable middleware functions
    if (exportableMiddleware.length > 0) {
      await writeFileInDir(
        logger,
        middlewareFile,
        serializeMiddlewareImports(middlewareFile, middleware, packageMappings)
      )
      return true
    }

    return false
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
