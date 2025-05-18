import { Command } from 'commander'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  serializeFileImports,
  writeFileInDir,
} from '../src/utils.js'
import { inspectorGlob } from '../src/inspector-glob.js'

export const pikkuHTTP = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding HTTP routes',
    'Found HTTP routes',
    [visitState.http.files.size === 0],
    async () => {
      const { httpRoutesFile, httpRoutesMetaFile, packageMappings } = cliConfig
      const { http } = visitState
      await writeFileInDir(
        httpRoutesFile,
        serializeFileImports(
          'addHTTPRoute',
          httpRoutesFile,
          http.files,
          packageMappings
        )
      )
      await writeFileInDir(
        httpRoutesMetaFile,
        `import { pikkuState } from '@pikku/core'\npikkuState('http', 'meta', ${JSON.stringify(http.meta, null, 2)})`
      )
    }
  )
}

async function action(cliOptions: PikkuCLIOptions): Promise<void> {
  logPikkuLogo()

  const cliConfig = await getPikkuCLIConfig(
    cliOptions.config,
    ['rootDir', 'srcDirectories', 'httpRoutesFile'],
    cliOptions.tags
  )
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )
  await pikkuHTTP(cliConfig, visitState)
}

export const routes = (program: Command): void => {
  program
    .command('routes')
    .description('Find all routes to import')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
