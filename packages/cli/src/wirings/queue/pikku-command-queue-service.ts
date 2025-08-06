import { serializeQueueWrapper } from './serialize-queue-wrapper.js'
import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'

export const pikkuQueueService: PikkuCommandWithoutState = async (
  logger,
  { queueWiringsFile, queueMapDeclarationFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Generating queue service wrapper',
    'Generated queue service wrapper',
    [
      queueWiringsFile === undefined,
      "queueWiringsFile isn't set in the pikku config",
    ],
    async () => {
      if (!queueWiringsFile) {
        throw new Error("queueWiringsFile is isn't set in the pikku config")
      }

      const queueMapDeclarationPath = getFileImportRelativePath(
        queueWiringsFile,
        queueMapDeclarationFile,
        packageMappings
      )

      const content = [serializeQueueWrapper(queueMapDeclarationPath)]
      await writeFileInDir(logger, queueWiringsFile, content.join('\n'))
    }
  )
}
