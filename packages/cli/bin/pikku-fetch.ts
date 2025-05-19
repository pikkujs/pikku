import { Command } from 'commander'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { serializeFetchWrapper } from '../src/serialize-fetch-wrapper.js'
import {
  getFileImportRelativePath,
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils/utils.js'

export const pikkuFetch = async ({
  fetchFile,
  httpRoutesMapDeclarationFile,
  packageMappings,
}: PikkuCLIConfig) => {
  await logCommandInfoAndTime(
    'Generating fetch wrapper',
    'Generated fetch wrapper',
    [fetchFile === undefined, "fetchFile isn't set in the pikku config"],
    async () => {
      if (!fetchFile) {
        throw new Error("fetchFile is isn't set in the pikku config")
      }

      const routesMapDeclarationPath = getFileImportRelativePath(
        fetchFile,
        httpRoutesMapDeclarationFile,
        packageMappings
      )

      const content = [serializeFetchWrapper(routesMapDeclarationPath)]
      await writeFileInDir(fetchFile, content.join('\n'))
    }
  )
}

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  logPikkuLogo()
  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'schemaDirectory', 'configDir', 'fetchFile'],
    options.tags,
    true
  )
  await pikkuFetch(cliConfig)
}

export const fetch = (program: Command): void => {
  program
    .command('fetch')
    .description('generate fetch wrapper')
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
