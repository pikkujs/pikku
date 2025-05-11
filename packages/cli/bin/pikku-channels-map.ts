import { Command } from 'commander'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { serializeTypedChannelsMap } from '../src/channels/serialize-typed-channel-map.js'
import { inspectorGlob } from '../src/inspector-glob.js'

export const pikkuChannelsMap = async (
  { channelsMapDeclarationFile, packageMappings }: PikkuCLIConfig,
  state: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Creating channels map',
    'Created channels map',
    [state.channels.files.size === 0],
    async () => {
      const content = serializeTypedChannelsMap(
        channelsMapDeclarationFile,
        packageMappings,
        state.functions.typesMap,
        state.channels.meta
      )
      await writeFileInDir(channelsMapDeclarationFile, content)
    }
  )
}

async function action(cliOptions: PikkuCLIOptions): Promise<void> {
  logPikkuLogo()
  const cliConfig = await getPikkuCLIConfig(
    cliOptions.config,
    ['rootDir', 'routeDirectories', 'routesFile'],
    cliOptions.tags,
    false
  )
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.routeDirectories,
    cliConfig.filters
  )
  await pikkuChannelsMap(cliConfig, visitState)
}

export const channelsMap = (program: Command): void => {
  program
    .command('channels-map')
    .description('Generate a map of all channels to aid in type checking')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
