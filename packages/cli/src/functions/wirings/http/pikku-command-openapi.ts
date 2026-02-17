import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { stringify } from 'yaml'

export const pikkuOpenAPI = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const { openAPI } = config

    if (!openAPI?.outputFile) {
      logger.debug({
        message:
          'Skipping creating OpenAPI spec since openAPI outfile is not defined.',
        type: 'skip',
      })
      return
    }

    const { openAPISpec } = await getInspectorState()

    if (!openAPISpec) {
      logger.debug({
        message: 'Skipping creating OpenAPI spec since no spec was generated.',
        type: 'skip',
      })
      return
    }

    if (openAPI.outputFile.endsWith('.json')) {
      await writeFileInDir(
        logger,
        openAPI.outputFile,
        JSON.stringify(openAPISpec, null, 2),
        { ignoreModifyComment: true }
      )
    } else if (
      openAPI.outputFile.endsWith('.yaml') ||
      openAPI.outputFile.endsWith('.yml')
    ) {
      await writeFileInDir(logger, openAPI.outputFile, stringify(openAPISpec), {
        ignoreModifyComment: true,
      })
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating OpenAPI spec',
      commandEnd: 'Created OpenAPI spec',
    }),
  ],
})
