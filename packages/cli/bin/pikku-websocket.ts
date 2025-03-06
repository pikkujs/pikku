import { Command } from 'commander'
import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { serializeWebsocketWrapper } from '../src/channels/serialize-websocket-wrapper.js'

export const pikkuWebSocket = async ({
  websocketFile,
  channelsMapDeclarationFile,
  packageMappings,
}: PikkuCLIConfig) => {
  await logCommandInfoAndTime(
    'Generating websocket wrapper',
    'Generated websocket wrapper',
    [
      websocketFile === undefined,
      "websocketFile isn't set in the pikku config",
    ],
    async () => {
      if (!websocketFile) {
        throw new Error("fetchFile is isn't set in the pikku config")
      }

      const channelsMapDeclarationPath = getFileImportRelativePath(
        websocketFile,
        channelsMapDeclarationFile,
        packageMappings
      )

      const content = [serializeWebsocketWrapper(channelsMapDeclarationPath)]
      await writeFileInDir(websocketFile, content.join('\n'))
    }
  )
}

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  logPikkuLogo()
  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'schemaDirectory', 'configDir', 'fetchFile'],
    options.tags,
    true
  )
  await pikkuWebSocket(cliConfig)
}

export const websocket = (program: Command): void => {
  program
    .command('websocket')
    .description('generate websocket wrapper')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
