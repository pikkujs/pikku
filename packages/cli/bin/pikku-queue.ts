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
    [visitState.queueProcessors.files.size === 0],
    async () => {
      const { queueProcessorsFile, queueProcessorsMetaFile, packageMappings } =
        cliConfig
      const { queueProcessors } = visitState
      await writeFileInDir(
        queueProcessorsMetaFile,
        serializeQueueMeta(queueProcessors.meta)
      )
      await writeFileInDir(
        queueProcessorsFile,
        serializeFileImports(
          'addQueueProcessors',
          queueProcessorsFile,
          queueProcessors.files,
          packageMappings
        )
      )
    }
  )
}
