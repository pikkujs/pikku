import { Command } from 'commander'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import {
  serializeChannels,
  serializeChannelMeta,
} from '../src/channels/serialize-channels.js'
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
        serializeChannels(channelsFile, channels.files, packageMappings),
        serializeChannelMeta(channels.meta),
      ]
      await writeFileInDir(channelsFile, content.join('\n\n'))
    }
  )
}

async function action(cliOptions: PikkuCLIOptions): Promise<void> {
  logPikkuLogo()

  const cliConfig = await getPikkuCLIConfig(
    cliOptions.config,
    ['rootDir', 'routeDirectories', 'routesFile'],
    cliOptions.tags
  )
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.routeDirectories,
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
