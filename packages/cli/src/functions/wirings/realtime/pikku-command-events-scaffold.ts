import { pikkuSessionlessFunc } from '#pikku/function'
import { getLeafImportPath } from '../../../utils/leaf-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
import { serializeEventsScaffold } from './serialize-events-scaffold.js'

export const pikkuEventsScaffold = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (
      !config.scaffold?.events ||
      !config.eventsChannelFile ||
      !config.eventsSchemasFile
    ) {
      logger.debug({
        message:
          'Skipping events scaffold (set scaffold.events in pikku.config.json to enable).',
        type: 'skip',
      })
      return false
    }
    const { schemas, functions } = serializeEventsScaffold((name) =>
      getLeafImportPath(config.eventsChannelFile!, name, config)
    )
    await writeFileInDir(logger, config.eventsSchemasFile, schemas)
    await writeFileInDir(logger, config.eventsChannelFile, functions)
    await removeLegacyScaffoldFile(config.eventsChannelFile)
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating events channel scaffold',
      commandEnd: 'Generated events channel scaffold',
    }),
  ],
})
