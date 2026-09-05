import { pikkuSessionlessFunc } from '#pikku/function'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeSchedulerMeta,
  serializeSchedulerMetaTS,
} from './serialize-scheduler-meta.js'
import { writeWiringMeta } from '../../../utils/write-wiring-meta.js'

export const pikkuScheduler = pikkuSessionlessFunc<void, boolean | undefined>({
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

    if (
      scheduledTasks.files.size === 0 ||
      Object.keys(scheduledTasks.meta).length === 0
    ) {
      return undefined
    }

    const fullMeta = serializeSchedulerMeta(scheduledTasks.meta)

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false

    await writeWiringMeta({
      logger,
      meta: fullMeta,
      metaJsonFile: schedulersWiringMetaJsonFile,
      metaFile: schedulersWiringMetaFile,
      packageMappings,
      supportsImportAttributes,
      serializeMetaTS: ({ jsonImportPath }) =>
        serializeSchedulerMetaTS(
          scheduledTasks.meta,
          jsonImportPath,
          supportsImportAttributes
        ),
    })

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
