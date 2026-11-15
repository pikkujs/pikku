import { pikkuSessionlessFunc } from '#pikku/function'
import { rm } from 'node:fs/promises'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { removeLegacyScaffoldFile } from '../../../utils/remove-legacy-scaffold-file.js'
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
    await writeFileInDir(
      logger,
      config.eventsChannelFile,
      serializeEventsScaffold()
    )
    // The schemas file belonged to the open topic routes this no longer wires.
    if (config.eventsSchemasFile) {
      await rm(config.eventsSchemasFile, { force: true })
    }
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
