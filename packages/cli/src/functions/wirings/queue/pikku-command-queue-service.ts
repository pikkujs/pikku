import { pikkuSessionlessFunc } from '#pikku'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueWrapper } from './serialize-queue-wrapper.js'

export const pikkuQueueService = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const { queueWiringsFile, queueMapDeclarationFile, packageMappings } =
      config

    // If queueWiringsFile is not set, clean up any existing file and return
    if (!queueWiringsFile) {
      logger.info({
        message:
          "Skipping generating queue service wrapper since queueWiringsFile isn't set in the pikku config.",
        type: 'skip',
      })
      return
    }

    const queueMapDeclarationPath = getFileImportRelativePath(
      queueWiringsFile,
      queueMapDeclarationFile,
      packageMappings
    )

    const content = [serializeQueueWrapper(queueMapDeclarationPath)]
    await writeFileInDir(logger, queueWiringsFile, content.join('\n'))
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating queue service wrapper',
      commandEnd: 'Generated queue service wrapper',
    }),
  ],
})
