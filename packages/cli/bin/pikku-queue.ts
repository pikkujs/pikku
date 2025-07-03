import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../src/utils/utils.js'
import { serializeQueueMeta } from '../src/serialize-queue-meta.js'

export const pikkuQueue = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding queues',
    'Found queue',
    [visitState.queueWorkers.files.size === 0],
    async () => {
      const { queueWorkersFile, queueWorkersMetaFile, packageMappings } =
        cliConfig
      const { queueWorkers } = visitState
      await writeFileInDir(
        queueWorkersMetaFile,
        serializeQueueMeta(queueWorkers.meta)
      )
      await writeFileInDir(
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
