import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeSchedulerMeta } from './serialize-scheduler-meta.js'

export const pikkuScheduler: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const { schedulersWiringFile, schedulersWiringMetaFile, packageMappings } =
      config
    const { scheduledTasks } = visitState

    await writeFileInDir(
      logger,
      schedulersWiringMetaFile,
      serializeSchedulerMeta(scheduledTasks.meta)
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
