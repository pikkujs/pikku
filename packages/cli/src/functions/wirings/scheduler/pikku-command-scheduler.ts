import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeSchedulerMeta,
  serializeSchedulerMetaTS,
} from './serialize-scheduler-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export const pikkuScheduler: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }, interaction, data) => {
    const visitState = await getInspectorState()
    const {
      schedulersWiringFile,
      schedulersWiringMetaFile,
      schedulersWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
    const { scheduledTasks } = visitState

    await writeFileInDir(
      logger,
      schedulersWiringMetaJsonFile,
      JSON.stringify(serializeSchedulerMeta(scheduledTasks.meta), null, 2)
    )

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
