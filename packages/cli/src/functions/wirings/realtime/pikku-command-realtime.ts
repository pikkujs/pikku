import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeRealtimeClient } from './serialize-realtime-client.js'

export const pikkuRealtime = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const realtimeFile = config.clientFiles?.realtimeFile
    const fetchFile = config.clientFiles?.fetchFile
    if (!realtimeFile) {
      logger.debug({
        message:
          'Skipping realtime client (set clientFiles.realtimeFile in pikku.config.json to enable).',
        type: 'skip',
      })
      return
    }
    if (!fetchFile) {
      logger.debug({
        message:
          'Skipping realtime client (clientFiles.fetchFile is required so PikkuRealtime can wrap PikkuFetch).',
        type: 'skip',
      })
      return
    }
    const topicsImport = config.clientFiles?.realtimeEventHubTopicsImport
    const fetchImportPath = getFileImportRelativePath(
      realtimeFile,
      fetchFile,
      config.packageMappings
    )
    const content = serializeRealtimeClient(topicsImport, fetchImportPath)
    await writeFileInDir(logger, realtimeFile, content)
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating realtime client',
      commandEnd: 'Generated realtime client',
    }),
  ],
})
