import { Command } from 'commander'
import { CLILogger, PikkuCLIOptions } from '../src/utils.js'
import { getPikkuCLIConfig } from '../src/pikku-cli-config.js'
import { inspectorGlob } from '../src/inspector-glob.js'
import { pikkuOpenAPI } from '../src/wirings/http/pikku-command-openapi.js'

async function action({ config, tags }: PikkuCLIOptions): Promise<void> {
  const logger = new CLILogger({ logLogo: true })
  const cliConfig = await getPikkuCLIConfig(
    config,
    ['rootDir', 'httpWiringsFile', 'openAPI', 'schemaDirectory', 'tsconfig'],
    {
      tags: tags || [],
    }
  )
  const visitState = await inspectorGlob(
    logger,
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )
  await pikkuOpenAPI(logger, cliConfig, visitState)
}

export const openapi = (program: Command): void => {
  program
    .command('openapi')
    .description('Generate an openapi spec')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
