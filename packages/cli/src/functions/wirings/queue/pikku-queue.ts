import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeQueueMetaTS,
  generateQueueRuntimeMeta,
} from './serialize-queue-meta.js'

export const pikkuQueue: any = pikkuSessionlessFunc<void, boolean | undefined>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      queueWorkersWiringFile,
      queueWorkersWiringMetaFile,
      queueWorkersWiringMetaJsonFile,
      queueWorkersWiringMetaVerboseFile,
      queueWorkersWiringMetaVerboseJsonFile,
      packageMappings,
      schema,
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

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const runtimeMeta = generateQueueRuntimeMeta(queueMeta)

    // Write runtime JSON file
    await writeFileInDir(
      logger,
      queueWorkersWiringMetaJsonFile,
      JSON.stringify(runtimeMeta, null, 2)
    )

    // Write runtime TypeScript file that imports JSON
    await writeFileInDir(
      logger,
      queueWorkersWiringMetaFile,
      serializeQueueMetaTS(
        './pikku-queue-workers-wirings-meta.gen.json',
        supportsImportAttributes
      )
    )

    // Write verbose JSON file
    await writeFileInDir(
      logger,
      queueWorkersWiringMetaVerboseJsonFile,
      JSON.stringify(queueMeta, null, 2)
    )

    // Write verbose TypeScript file that imports JSON
    const verboseImportStatement = supportsImportAttributes
      ? `import metaData from './pikku-queue-workers-wirings-meta.verbose.gen.json' with { type: 'json' }`
      : `import metaData from './pikku-queue-workers-wirings-meta.verbose.gen.json'`

    const verboseOutput: string[] = []
    verboseOutput.push("import { pikkuState } from '@pikku/core'")
    verboseOutput.push("import { QueueWorkersMeta } from '@pikku/core/queue'")
    verboseOutput.push(verboseImportStatement)
    verboseOutput.push('')
    verboseOutput.push(
      "pikkuState('queue', 'meta', metaData as QueueWorkersMeta)"
    )

    await writeFileInDir(
      logger,
      queueWorkersWiringMetaVerboseFile,
      verboseOutput.join('\n')
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
