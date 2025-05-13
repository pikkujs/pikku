import { Command } from 'commander'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import {
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { serializeTypedRoutesMap } from '../src/serialize-typed-http-map.js'
import { inspectorGlob } from '../src/inspector-glob.js'

export const pikkuHTTPMap = async (
  { httpRoutesMapDeclarationFile, packageMappings }: PikkuCLIConfig,
  { http, functions }: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Creating HTTP map',
    'Created HTTP map',
    [http.files.size === 0],
    async () => {
      const content = serializeTypedRoutesMap(
        httpRoutesMapDeclarationFile,
        packageMappings,
        functions.typesMap,
        http.meta,
        http.metaInputTypes
      )
      await writeFileInDir(httpRoutesMapDeclarationFile, content)
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
  await pikkuHTTPMap(cliConfig, visitState)
}

export const routesMap = (program: Command): void => {
  program
    .command('map')
    .description('Generate a map of all routes to aid in type checking')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
