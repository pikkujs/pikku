import { Command } from 'commander'
import { CLILogger, PikkuCLIOptions } from '../src/utils.js'
import { getPikkuCLIConfig } from '../src/pikku-cli-config.js'
import { inspectorGlob } from '../src/inspector-glob.js'
import { pikkuNext } from '../src/runtimes/nextjs/pikku-command-nextjs.js'

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  const logger = new CLILogger({ logLogo: true })

  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'schemaDirectory', 'configDir'],
    {
      tags: options.tags,
      types: options.types,
      directories: options.directories,
    },
    true
  )
  const visitState = await inspectorGlob(
    logger,
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )
  await pikkuNext(logger, cliConfig, visitState, options)
}

export const nextjs = (program: Command): void => {
  program
    .command('nextjs')
    .description('generate nextjs wrapper')
    .option('--pikku-config-type', 'The type of your pikku config object')
    .option(
      '--singleton-services-factory-type',
      'The type of your singleton services factory'
    )
    .option(
      '--session-services-factory-type',
      'The type of your session services factory'
    )
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
