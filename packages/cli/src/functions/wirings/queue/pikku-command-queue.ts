import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeQueueMeta,
  serializeQueueMetaTS,
} from './serialize-queue-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

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

    // Write minimal JSON file (runtime-only fields)
    const minimalMeta = stripVerboseFields(fullMeta)
    await writeFileInDir(
      logger,
      queueWorkersWiringMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

    // Write verbose JSON only if it has additional fields
    if (hasVerboseFields(fullMeta)) {
      const verbosePath = queueWorkersWiringMetaJsonFile.replace(
        /\.gen\.json$/,
        '-verbose.gen.json'
      )
      await writeFileInDir(
        logger,
        verbosePath,
        JSON.stringify(fullMeta, null, 2)
      )
    }

    // Calculate relative path from TS file to JSON file
    const jsonImportPath = getFileImportRelativePath(
      queueWorkersWiringMetaFile,
      queueWorkersWiringMetaJsonFile,
      packageMappings
    )

    // Write TypeScript file that imports JSON
    await writeFileInDir(
      logger,
      queueWorkersWiringMetaFile,
      serializeQueueMetaTS(
        jsonImportPath,
        schema?.supportsImportAttributes ?? false
      )
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
      commandStart: 'Finding Queues',
      commandEnd: 'Found Queues',
    }),
  ],
})
