import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../../utils.js'
import { serializeSchedulerMeta } from './serialize-scheduler-meta.js'
import { PikkuCommand } from '../../types.js'

export const pikkuScheduler: PikkuCommand = async (
  logger,
  cliConfig,
  visitState
) => {
  return await logCommandInfoAndTime(
    logger,
    'Finding scheduled tasks',
    'Found scheduled tasks',
    [visitState.scheduledTasks.files.size === 0],
    async () => {
      const {
        schedulersWiringFile,
        schedulersWiringMetaFile,
        packageMappings,
      } = cliConfig
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
    }
  )
}
