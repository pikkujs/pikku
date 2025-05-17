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
import { inspectorGlob } from '../src/inspector-glob.js'

export const pikkuChannels = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding Channels',
    'Found channels',
    [visitState.channels.files.size === 0],
    async () => {
      const { channelsFile, packageMappings } = cliConfig
      const { channels } = visitState
      const content = [
        serializeFileImports(
          'addChannel',
          channelsFile,
          channels.files,
          packageMappings
        ),
        `import { pikkuState } from '@pikku/core'\npikkuState('channel', 'meta', ${JSON.stringify(channels.meta, null, 2)})`,
      ]
      await writeFileInDir(channelsFile, content.join('\n\n'))
    }
  )
}

async function action(cliOptions: PikkuCLIOptions): Promise<void> {
  logPikkuLogo()

  const cliConfig = await getPikkuCLIConfig(
    cliOptions.config,
    ['rootDir', 'srcDirectories', 'httpRoutesFile'],
    cliOptions.tags
  )
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )
  await pikkuChannels(cliConfig, visitState)
}

export const channels = (program: Command): void => {
  program
    .command('channels')
    .description('Find all channels to import')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
