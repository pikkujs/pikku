import { Command } from 'commander'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { serializeHTTPRoutesMeta } from '../src/http/serialize-route-meta.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { serializeRoutes } from '../src/http/serialize-route-imports.js'
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
      const { routesFile, packageMappings } = cliConfig
      const { http } = visitState
      const content = [
        serializeRoutes(routesFile, http.files, packageMappings),
        serializeHTTPRoutesMeta(http.meta),
      ]
      await writeFileInDir(routesFile, content.join('\n\n'))
    }
  )
}

async function action(cliOptions: PikkuCLIOptions): Promise<void> {
  logPikkuLogo()

  const cliConfig = await getPikkuCLIConfig(
    cliOptions.config,
    ['rootDir', 'routeDirectories', 'routesFile'],
    cliOptions.tags
  )
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.routeDirectories,
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
