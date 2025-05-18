import { Command } from 'commander'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  serializeFileImports,
  writeFileInDir,
} from '../src/utils.js'
import { serializeSchedulerMeta } from '../src/serialize-scheduler-meta.js'
import { inspectorGlob } from '../src/inspector-glob.js'

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

async function action(options: PikkuCLIOptions): Promise<void> {
  logPikkuLogo()

  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'srcDirectories', 'httpRoutesFile'],
    options.tags
  )
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )
  await pikkuScheduler(cliConfig, visitState)
}

export const schedules = (program: Command): void => {
  program
    .command('scheduler')
    .description('Find all scheduled tasks to import')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
