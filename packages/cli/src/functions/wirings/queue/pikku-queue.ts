import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeQueueMeta } from './serialize-queue-meta.js'

export const pikkuQueue: any = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      queueWorkersWiringFile,
      queueWorkersWiringMetaFile,
      packageMappings,
    } = config
    const { queueWorkers } = visitState

    // Add remote RPC worker to queue metadata if it exists
    const queueMeta = { ...queueWorkers.meta }
    if (config.rpc?.remoteRpcWorkersPath) {
      queueMeta['pikku-remote-internal-rpc'] = {
        pikkuFuncName: 'pikkuRemoteInternalRPC',
        queueName: 'pikku-remote-internal-rpc',
      }
    }

    await writeFileInDir(
      logger,
      queueWorkersWiringMetaFile,
      serializeQueueMeta(queueMeta)
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
    }),
  ],
})
