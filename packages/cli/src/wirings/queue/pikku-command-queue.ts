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
      const {
        queueWorkersWiringFile,
        queueWorkersWiringMetaFile,
        packageMappings,
      } = cliConfig
      const { queueWorkers } = visitState
      await writeFileInDir(
        logger,
        queueWorkersWiringMetaFile,
        serializeQueueMeta(queueWorkers.meta)
      )
      await writeFileInDir(
        logger,
        queueWorkersWiringFile,
        serializeFileImports(
          'addQueueWorkers',
          queueWorkersWiringFile,
          queueWorkers.files,
          packageMappings
        )
      )
    }
  )
}
