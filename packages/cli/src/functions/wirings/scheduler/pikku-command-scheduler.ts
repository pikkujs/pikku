import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeSchedulerMeta,
  serializeSchedulerMetaTS,
} from './serialize-scheduler-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import {
  stripVerboseFields,
  hasVerboseFields,
} from '../../../utils/strip-verbose-meta.js'

export const pikkuScheduler: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      schedulersWiringFile,
      schedulersWiringMetaFile,
      schedulersWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
    const { scheduledTasks } = visitState

    const fullMeta = serializeSchedulerMeta(scheduledTasks.meta)

    // Write minimal JSON (runtime-only fields)
    const minimalMeta = stripVerboseFields(fullMeta)
    await writeFileInDir(
      logger,
      schedulersWiringMetaJsonFile,
      JSON.stringify(minimalMeta, null, 2)
    )

    // Write verbose JSON only if it has additional fields
    if (hasVerboseFields(fullMeta)) {
      const verbosePath = schedulersWiringMetaJsonFile.replace(
        /\.gen\.json$/,
        '-verbose.gen.json'
      )
      await writeFileInDir(
        logger,
        verbosePath,
        JSON.stringify(fullMeta, null, 2)
      )
    }

    const jsonImportPath = getFileImportRelativePath(
      schedulersWiringMetaFile,
      schedulersWiringMetaJsonFile,
      packageMappings
    )

    await writeFileInDir(
      logger,
      schedulersWiringMetaFile,
      serializeSchedulerMetaTS(
        scheduledTasks.meta,
        jsonImportPath,
        schema?.supportsImportAttributes ?? false
      )
    )

    await writeFileInDir(
      logger,
      schedulersWiringFile,
      serializeFileImports(
        'addScheduledTasks',
        schedulersWiringFile,
        scheduledTasks.files,
        packageMappings
      )
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding Scheduled tasks',
      commandEnd: 'Found Scheduled tasks',
    }),
  ],
})
