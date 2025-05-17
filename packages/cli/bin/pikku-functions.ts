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

export const pikkuFunctions = async (
  cliConfig: PikkuCLIConfig,
  visitState: InspectorState
) => {
  return await logCommandInfoAndTime(
    'Finding Pikku functions',
    'Found Pikku functions',
    [visitState.functions.files.size === 0],
    async () => {
      const { functionsFile, packageMappings } = cliConfig
      const { functions } = visitState
      const content = [
        serializeFileImports('addFunction', functionsFile, functions.files, packageMappings),
        `import { pikkuState } from '@pikku/core'\npikkuState('functions', 'meta', ${JSON.stringify(functions.meta, null, 2)})`
      ]
      await writeFileInDir(functionsFile, content.join('\n\n'))
    }
  )
}

async function action(cliOptions: PikkuCLIOptions): Promise<void> {
  logPikkuLogo()

  const cliConfig = await getPikkuCLIConfig(
    cliOptions.config,
    ['rootDir', 'srcDirectories', 'functionsFile'],
    cliOptions.tags
  )
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.srcDirectories,
    cliConfig.filters
  )
  await pikkuFunctions(cliConfig, visitState)
}

export const routes = (program: Command): void => {
  program
    .command('functions')
    .description('Find all functions to import')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
