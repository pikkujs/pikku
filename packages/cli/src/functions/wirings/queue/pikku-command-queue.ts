import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueMeta } from './serialize-queue-meta.js'

export const pikkuQueue: any = pikkuSessionlessFunc<void, true | undefined>({
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

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding queues',
      commandEnd: 'Found queue',
      skipCondition: async ({ getInspectorState }) => {
        const visitState = await getInspectorState()
        return visitState.queueWorkers.files.size === 0
      },
      skipMessage: 'none found',
    }),
  ],
})
