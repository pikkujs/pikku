import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRealtimeClient } from './serialize-realtime-client.js'

export const pikkuRealtime = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const realtimeFile = config.clientFiles?.realtimeFile
    if (!realtimeFile) {
      logger.debug({
        message:
          'Skipping realtime client (set clientFiles.realtimeFile in pikku.config.json to enable).',
        type: 'skip',
      })
      return
    }
    const topicsImport = config.clientFiles?.realtimeEventHubTopicsImport
    const content = serializeRealtimeClient(topicsImport)
    await writeFileInDir(logger, realtimeFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating realtime client',
      commandEnd: 'Generated realtime client',
    }),
  ],
})
