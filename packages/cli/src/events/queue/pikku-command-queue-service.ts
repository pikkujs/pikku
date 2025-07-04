import { serializeQueueWrapper } from './serialize-queue-wrapper.js'
import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommandWithoutState } from '../../types.js'

export const pikkuQueueService: PikkuCommandWithoutState = async (
  logger,
  { queueFile, queueMapDeclarationFile, packageMappings }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Generating queue service wrapper',
    'Generated queue service wrapper',
    [queueFile === undefined, "queueFile isn't set in the pikku config"],
    async () => {
      if (!queueFile) {
        throw new Error("queueFile is isn't set in the pikku config")
      }

      const queueMapDeclarationPath = getFileImportRelativePath(
        queueFile,
        queueMapDeclarationFile,
        packageMappings
      )

      const content = [serializeQueueWrapper(queueMapDeclarationPath)]
      await writeFileInDir(logger, queueFile, content.join('\n'))
    }
  )
}
