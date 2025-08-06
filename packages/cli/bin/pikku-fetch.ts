import { Command } from 'commander'
import { getPikkuCLIConfig } from '../src/pikku-cli-config.js'
import { pikkuFetch } from '../src/wirings/fetch/index.js'
import { CLILogger, PikkuCLIOptions } from '../src/utils.js'

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
  await pikkuFetch(logger, cliConfig)
}

export const fetch = (program: Command): void => {
  program
    .command('fetch')
    .description('generate fetch wrapper')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
