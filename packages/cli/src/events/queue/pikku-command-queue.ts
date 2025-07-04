import { PikkuCLIConfig } from '../../pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../../utils.js'
import { serializeQueueMeta } from './serialize-queue-meta.js'
import { PikkuCommand } from '../../types.js'

export const pikkuQueue: PikkuCommand = async (
  logger,
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding queues',
    'Found queue',
    [visitState.queueWorkers.files.size === 0],
    async () => {
      const { queueWorkersFile, queueWorkersMetaFile, packageMappings } =
        cliConfig
      const { queueWorkers } = visitState
      await writeFileInDir(
        logger,
        queueWorkersMetaFile,
        serializeQueueMeta(queueWorkers.meta)
      )
      await writeFileInDir(
        logger,
        queueWorkersFile,
        serializeFileImports(
          'addQueueWorkers',
          queueWorkersFile,
          queueWorkers.files,
          packageMappings
        )
      )
    }
  )
}
