import { pikkuSessionlessFunc } from '#pikku/function'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeQueueMeta,
  serializeQueueMetaTS,
} from './serialize-queue-meta.js'
import { writeWiringMeta } from '../../../utils/write-wiring-meta.js'

export const pikkuCommandQueue = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      queueWorkersWiringFile,
      queueWorkersWiringMetaFile,
      queueWorkersWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
    const { queueWorkers } = visitState

    // Gate on the meta alone, never on `files`. Workflows synthesise their own
    // `wf-orchestrator-*` / `wf-step-*` queue meta during post-processing, and
    // those entries have no declaring source file — so a project that uses
    // workflows but hand-declares no `wireQueueWorker` has a full `meta` and an
    // empty `files`. Bailing on `files.size === 0` there skipped writing the
    // queue meta entirely, which left `pikkuState(queue,meta)` empty at runtime:
    // `getOrchestratorQueueName()` then never found a per-workflow queue and
    // EVERY workflow fell back to the single shared `pikku-workflow-orchestrator`,
    // where one slow job head-of-line-blocks everything queued behind it.
    if (Object.keys(queueWorkers.meta).length === 0) {
      return undefined
    }

    const fullMeta = serializeQueueMeta(queueWorkers.meta)

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false

    await writeWiringMeta({
      logger,
      meta: fullMeta,
      metaJsonFile: queueWorkersWiringMetaJsonFile,
      metaFile: queueWorkersWiringMetaFile,
      packageMappings,
      supportsImportAttributes,
      serializeMetaTS: ({ jsonImportPath }) =>
        serializeQueueMetaTS(jsonImportPath, supportsImportAttributes),
    })

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
      commandStart: 'Finding Queues',
      commandEnd: 'Found Queues',
    }),
  ],
})
