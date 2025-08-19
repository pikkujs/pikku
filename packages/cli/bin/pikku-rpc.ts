import { Command } from 'commander'
import { CLILogger, PikkuCLIOptions } from '../src/utils.js'
import { getPikkuCLIConfig } from '../src/pikku-cli-config.js'
import { pikkuRPCClient } from '../src/wirings/rpc/pikku-command-rpc-client.js'

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  const logger = new CLILogger({ logLogo: true })

  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'schemaDirectory', 'configDir', 'fetchFile'],
    {
      tags: options.tags,
      types: options.types,
      directories: options.directories,
    },
    true
  )
  await pikkuRPCClient(logger, cliConfig)
}

export const rpc = (program: Command): void => {
  program
    .command('rpc')
    .description('generate rpc wrapper')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
