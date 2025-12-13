import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeQueueMeta,
  serializeQueueMetaTS,
} from './serialize-queue-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuQueue: any = pikkuSessionlessFunc<void, boolean>({
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

    // Write JSON file
    await writeFileInDir(
      logger,
      queueWorkersWiringMetaJsonFile,
      JSON.stringify(serializeQueueMeta(queueWorkers.meta), null, 2)
    )

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
      commandStart: 'Finding queues',
      commandEnd: 'Found queue',
    }),
  ],
})
