import { Command } from 'commander'
import {
  getPikkuCLIConfig,
  PikkuCLIConfig,
} from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import {
  serializeSchedulerMeta,
  serializeSchedulers,
} from '../src/scheduler/serialize-schedulers.js'
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
      const { schedulersFile, packageMappings } = cliConfig
      const { scheduledTasks } = visitState
      const content = [
        serializeSchedulers(
          schedulersFile,
          scheduledTasks.files,
          packageMappings
        ),
        serializeSchedulerMeta(scheduledTasks.meta),
      ]
      await writeFileInDir(schedulersFile, content.join('\n\n'))
    }
  )
}

async function action(cliOptions: PikkuCLIOptions): Promise<void> {
  logPikkuLogo()

  const cliConfig = await getPikkuCLIConfig(cliOptions.config, [
    'rootDir',
    'routeDirectories',
    'routesFile',
  ])
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.routeDirectories
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
