import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports, writeFileInDir } from '../../../utils/utils.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeSchedulerMeta } from './serialize-scheduler-meta.js'

export const pikkuScheduler = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const visitState = await getInspectorState()
    const { schedulersWiringFile, schedulersWiringMetaFile, packageMappings } =
      cliConfig
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
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding scheduled tasks',
      commandEnd: 'Found scheduled tasks',
      skipCondition: async ({ getInspectorState }) => {
        const visitState = await getInspectorState()
        return visitState.scheduledTasks.files.size === 0
      },
      skipMessage: 'none found',
    }),
  ],
})
