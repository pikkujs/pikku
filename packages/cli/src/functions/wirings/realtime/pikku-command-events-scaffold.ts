import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeEventsScaffold } from './serialize-events-scaffold.js'

export const pikkuEventsScaffold = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config }) => {
    if (!config.scaffold?.events || !config.eventsChannelFile) {
      logger.debug({
        message:
          'Skipping events scaffold (set scaffold.events in pikku.config.json to enable).',
        type: 'skip',
      })
      return false
    }
    const authRequired = config.scaffold.events === 'auth'
    const pikkuTypesImportPath = getFileImportRelativePath(
      config.eventsChannelFile,
      config.typesDeclarationFile,
      config.packageMappings
    )
    await writeFileInDir(
      logger,
      config.eventsChannelFile,
      serializeEventsScaffold(authRequired, pikkuTypesImportPath)
    )
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating events channel scaffold',
      commandEnd: 'Generated events channel scaffold',
    }),
  ],
})
