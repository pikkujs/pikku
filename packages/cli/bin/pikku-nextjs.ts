import { Command } from 'commander'
import { serializeNextJsBackendWrapper as serializeNextBackendWrapper } from '../src/nextjs/serialize-nextjs-backend-wrapper.js'
import { serializeNextJsHTTPWrapper as serializeNextHTTPWrapper } from '../src/nextjs/serialize-nextjs-http-wrapper.js'
import {
  getFileImportRelativePath,
  getPikkuFilesAndMethods,
  logCommandInfoAndTime,
  logPikkuLogo,
  PikkuCLIOptions,
  writeFileInDir,
} from '../src/utils.js'
import { getPikkuCLIConfig, PikkuCLIConfig } from '../src/pikku-cli-config.js'
import { InspectorState } from '@pikku/inspector'
import { inspectorGlob } from '../src/inspector-glob.js'

export const pikkuNext = async (
  {
    nextBackendFile,
    nextHTTPFile,
    routesFile,
    routesMapDeclarationFile,
    schemaDirectory,
    packageMappings,
    fetchFile,
  }: PikkuCLIConfig,
  visitState: InspectorState,
  options: PikkuCLIOptions
) => {
  return await logCommandInfoAndTime(
    'Generating nextjs wrapper',
    'Generated nextjs wrapper',
    [
      nextBackendFile === undefined && nextHTTPFile === undefined,
      'nextjs outfile is not defined',
    ],
    async () => {
      if (!nextBackendFile && !nextHTTPFile) {
        throw new Error(
          'nextBackendFile or nextHTTPFile is required in pikku config for nextJS'
        )
      }

      if (nextHTTPFile && !fetchFile) {
        throw new Error(
          'fetchFile is required in pikku config in order for nextJS http wrapper to work'
        )
      }

      if (nextBackendFile) {
        const {
          pikkuConfigFactory,
          singletonServicesFactory,
          sessionServicesFactory,
        } = await getPikkuFilesAndMethods(
          visitState,
          packageMappings,
          nextBackendFile,
          options,
          {
            config: true,
            singletonServicesFactory: true,
            sessionServicesFactory: true,
          }
        )

        const pikkuConfigImport = `import { ${pikkuConfigFactory.variable} as createConfig } from '${getFileImportRelativePath(nextBackendFile, pikkuConfigFactory.file, packageMappings)}'`
        const singletonServicesImport = `import { ${singletonServicesFactory.variable} as createSingletonServices } from '${getFileImportRelativePath(nextBackendFile, singletonServicesFactory.file, packageMappings)}'`
        const sessionServicesImport = `import { ${sessionServicesFactory.variable} as createSessionServices } from '${getFileImportRelativePath(nextBackendFile, sessionServicesFactory.file, packageMappings)}'`

        const routesPath = getFileImportRelativePath(
          nextBackendFile,
          routesFile,
          packageMappings
        )

        const routesMapDeclarationPath = getFileImportRelativePath(
          nextBackendFile,
          routesMapDeclarationFile,
          packageMappings
        )
        const schemasPath = getFileImportRelativePath(
          nextBackendFile,
          `${schemaDirectory}/register.gen.ts`,
          packageMappings
        )

        const content = serializeNextBackendWrapper(
          routesPath,
          routesMapDeclarationPath,
          schemasPath,
          pikkuConfigImport,
          singletonServicesImport,
          sessionServicesImport
        )
        await writeFileInDir(nextBackendFile, content)
      }

      if (nextHTTPFile) {
        const routesPath = getFileImportRelativePath(
          nextHTTPFile,
          routesFile,
          packageMappings
        )

        const routesMapDeclarationPath = getFileImportRelativePath(
          nextHTTPFile,
          routesMapDeclarationFile,
          packageMappings
        )

        const content = serializeNextHTTPWrapper(
          routesPath,
          routesMapDeclarationPath
        )
        await writeFileInDir(nextHTTPFile, content)
      }
    }
  )
}

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  logPikkuLogo()
  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'schemaDirectory', 'configDir'],
    options.tags,
    true
  )
  const visitState = await inspectorGlob(
    cliConfig.rootDir,
    cliConfig.routeDirectories,
    cliConfig.filters
  )
  await pikkuNext(cliConfig, visitState, options)
}

export const nextjs = (program: Command): void => {
  program
    .command('nextjs')
    .description('generate nextjs wrapper')
    .option('-ct | --pikku-config-type', 'The type of your pikku config object')
    .option(
      '-ss | --singleton-services-factory-type',
      'The type of your singleton services factory'
    )
    .option(
      '-se | --session-services-factory-type',
      'The type of your session services factory'
    )
    .option('-c | --config <string>', 'The path to pikku cli config file')
    .action(action)
}
