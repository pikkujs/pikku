import { logCommandInfoAndTime, writeFileInDir } from '../../utils.js'
import { serializeQueueMap } from './serialize-queue-map.js'
import { PikkuCommand } from '../../types.js'

export const pikkuQueueMap: PikkuCommand = async (
  logger,
  { queueMapDeclarationFile, packageMappings },
  { queueWorkers, functions }
) => {
  return await logCommandInfoAndTime(
    logger,
    'Creating Queue map',
    'Created Queue map',
    [queueWorkers.files.size === 0],
    async () => {
      const content = serializeQueueMap(
        queueMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        functions.meta,
        queueWorkers.meta
      )
      await writeFileInDir(logger, queueMapDeclarationFile, content)
    }
  )
}
