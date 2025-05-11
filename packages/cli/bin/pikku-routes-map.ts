import { Command } from 'commander'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { serializeTypedRoutesMap } from '../src/http/serialize-typed-route-map.js'
import { inspectorGlob } from '../src/inspector-glob.js'

export const pikkuHTTPMap = async (
  { routesMapDeclarationFile, packageMappings }: PikkuCLIConfig,
  { http, functions }: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Creating routes map',
    'Created routes map',
    [http.files.size === 0],
    async () => {
      const content = serializeTypedRoutesMap(
        routesMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        http.meta,
        http.metaInputTypes
      )
      await writeFileInDir(routesMapDeclarationFile, content)
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
  await pikkuHTTPMap(cliConfig, visitState)
}

export const routesMap = (program: Command): void => {
  program
    .command('map')
    .description('Generate a map of all routes to aid in type checking')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
