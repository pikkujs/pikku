import { Command } from 'commander'

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  const logger = new CLILogger({ logLogo: true, silent: options.silent })

  const cliConfig = await getPikkuCLIConfig(
    options.config,
    [],
    {
      tags: options.tags,
      types: options.types,
      directories: options.directories,
    },
    true
  )

  if (options.watch) {
    watch(logger, cliConfig, options)
  } else {
    await runAll(logger, cliConfig, options)
  }
}

export const all = (program: Command): void => {
  program
    .command('all', { isDefault: true })
    .description('Generate all the files used by pikku')
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
    .option('-t | --tags <tags...>', 'Which tags to filter by')
    .option(
      '--types <types...>',
      'Which types to filter by (http, channel, queue, scheduler, rpc, mcp)'
    )
    .option('--directories <directories...>', 'Which directories to filter by')
    .option('-w | --watch', 'Whether to watch file changes')
    .option('-s | --silent', 'Silent mode - only show errors')
    .action(action)
}
