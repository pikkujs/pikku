import { PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  serializeFileImports,
  writeFileInDir,
} from '../src/utils/utils.js'
import { serializeSchedulerMeta } from '../src/serialize-scheduler-meta.js'

export const pikkuScheduler = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding scheduled tasks',
    'Found scheduled tasks',
    [visitState.scheduledTasks.files.size === 0],
    async () => {
      const { schedulersFile, schedulersMetaFile, packageMappings } = cliConfig
      const { scheduledTasks } = visitState
      await writeFileInDir(
        schedulersMetaFile,
        serializeSchedulerMeta(scheduledTasks.meta)
      )
      await writeFileInDir(
        schedulersFile,
        serializeFileImports(
          'addSerializedTasks',
          schedulersFile,
          scheduledTasks.files,
          packageMappings
        )
      )
    }
  )
}
