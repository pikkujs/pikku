import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueMeta } from './serialize-queue-meta.js'

export const pikkuQueue = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const visitState = await getInspectorState()
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
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding queues',
      commandEnd: 'Found queue',
      skipCondition: async ({ getInspectorState }) => {
        const { queueWorkers } = await getInspectorState()
        return queueWorkers.files.size === 0
      },
      skipMessage: 'none found',
    }),
  ],
})
