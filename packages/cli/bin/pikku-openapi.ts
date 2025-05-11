import { Command } from 'commander'
import {
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { generateSchemas } from '../src/schema/schema-generator.js'
import { generateOpenAPISpec } from '../src/openapi/openapi-spec-generator.js'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { stringify } from 'yaml'
import { inspectorGlob } from '../src/inspector-glob.js'

export const pikkuOpenAPI = async (
  { tsconfig, openAPI }: PikkuCLIConfig,
  { http, functions }: InspectorState
) => {
  await logCommandInfoAndTime(
    'Creating OpenAPI spec',
    'Created OpenAPI spec',
    [openAPI?.outputFile === undefined, 'openAPI outfile is not defined'],
    async () => {
      if (!openAPI?.outputFile) {
        throw new Error('openAPI is required')
      }
      const schemas = await generateSchemas(tsconfig, [http.typesMap, functions.typesMap], http.meta)
      const openAPISpec = await generateOpenAPISpec(
        http.meta,
        schemas,
        openAPI.additionalInfo
      )
      if (openAPI.outputFile.endsWith('.json')) {
        await writeFileInDir(
          openAPI.outputFile,
          JSON.stringify(openAPISpec, null, 2),
          true
        )
      } else if (
        openAPI.outputFile.endsWith('.yaml') ||
        openAPI.outputFile.endsWith('.yml')
      ) {
        await writeFileInDir(openAPI.outputFile, stringify(openAPISpec), true)
      }
    }
  )
}

async function action({ config, tags }: PikkuCLIOptions): Promise<void> {
  logPikkuLogo()
  const cliConfig = await getPikkuCLIConfig(
    config,
    ['rootDir', 'routesFile', 'openAPI', 'schemaDirectory', 'tsconfig'],
    tags
  )
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.routeDirectories,
    cliConfig.filters
  )
  await pikkuOpenAPI(cliConfig, visitState)
}

export const openapi = (program: Command): void => {
  program
    .command('openapi')
    .description('Generate an openapi spec')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
