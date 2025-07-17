import { Command } from 'commander'
import { getPikkuCLIConfig } from '../src/pikku-cli-config.js'
import { CLILogger, PikkuCLIOptions } from '../src/utils.js'
import { pikkuQueueService } from '../src/events/queue/pikku-command-queue-service.js'

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  const logger = new CLILogger({ logLogo: true })

  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'schemaDirectory', 'configDir', 'queueFile'],
    {
      tags: options.tags,
      types: options.types,
      directories: options.directories,
    },
    true
  )
  await pikkuQueueService(logger, cliConfig)
}

export const queue = (program: Command): void => {
  program
    .command('queue')
    .description('generate queue service wrapper')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
