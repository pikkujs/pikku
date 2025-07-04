import { Command } from 'commander'

import { getPikkuCLIConfig } from '../src/pikku-cli-config.js'
import { inspectorGlob } from '../src/inspector-glob.js'
import { pikkuSchemas } from '../src/schemas.js'
import { CLILogger } from '../src/utils.js'

async function action({ config }: { config?: string }): Promise<void> {
  const logger = new CLILogger({ logLogo: true })

  const cliConfig = await getPikkuCLIConfig(config, [
    'srcDirectories',
    'schemaDirectory',
    'tsconfig',
  ])
  const visitState = await inspectorGlob(
    logger,
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )
  await pikkuSchemas(logger, cliConfig, visitState)
}

export const schemas = (program: Command): void => {
  program
    .command('schemas')
    .description('Generate schemas for all the expected function input types')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
