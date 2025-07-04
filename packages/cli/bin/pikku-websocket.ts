import { Command } from 'commander'
import { CLILogger, PikkuCLIOptions } from '../src/utils.js'
import { getPikkuCLIConfig } from '../src/pikku-cli-config.js'
import { pikkuWebSocketTyped } from '../src/events/channels/pikku-command-websocket-typed.js'

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  const logger = new CLILogger({ logLogo: true })

  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'schemaDirectory', 'configDir', 'fetchFile'],
    options.tags,
    true
  )
  await pikkuWebSocketTyped(logger, cliConfig)
}

export const websocket = (program: Command): void => {
  program
    .command('websocket')
    .description('generate websocket wrapper')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
