import { Command } from 'commander'
import { saveSchemas, generateSchemas } from '../src/schema-generator.js'

import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { logCommandInfoAndTime, logPikkuLogo } from '../src/utils.js'
import { inspectorGlob } from '../src/inspector-glob.js'

export const pikkuSchemas = async (
  { tsconfig, schemaDirectory, supportsImportAttributes }: PikkuCLIConfig,
  { functions, http, channels }: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Creating schemas',
    'Created schemas',
    [false],
    async () => {
      const schemas = await generateSchemas(
        tsconfig,
        functions.typesMap,
        functions.meta,
        http.meta
      )
      await saveSchemas(
        schemaDirectory,
        schemas,
        functions.typesMap,
        functions.meta,
        supportsImportAttributes
      )
    }
  )
}

async function action({ config }: { config?: string }): Promise<void> {
  logPikkuLogo()

  const cliConfig = await getPikkuCLIConfig(config, [
    'srcDirectories',
    'schemaDirectory',
    'tsconfig',
  ])
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )
  await pikkuSchemas(cliConfig, visitState)
}

export const schemas = (program: Command): void => {
  program
    .command('schemas')
    .description('Generate schemas for all the expected function input types')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
