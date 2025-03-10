import { Command } from 'commander'
import { serializeNextJsWrapper } from '../src/nextjs/serialize-nextjs-wrapper.js'
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
    nextJSfile,
    routesFile,
    routesMapDeclarationFile,
    schemaDirectory,
    packageMappings,
  }: PikkuCLIConfig,
  visitState: InspectorState,
  options: PikkuCLIOptions
) => {
  return await logCommandInfoAndTime(
    'Generating nextjs wrapper',
    'Generated nextjs wrapper',
    [nextJSfile === undefined, 'nextjs outfile is not defined'],
    async () => {
      if (!nextJSfile) {
        throw new Error('nextJSfile is required in pikku config')
      }

      const {
        pikkuConfigFactory,
        singletonServicesFactory,
        sessionServicesFactory,
        userSessionType,
      } = await getPikkuFilesAndMethods(
        visitState,
        packageMappings,
        nextJSfile,
        options,
        {
          config: true,
          singletonServicesFactory: true,
          sessionServicesFactory: true,
        }
      )

      const pikkuConfigImport = `import { ${pikkuConfigFactory.variable} as createConfig } from '${getFileImportRelativePath(nextJSfile, pikkuConfigFactory.file, packageMappings)}'`
      const singletonServicesImport = `import { ${singletonServicesFactory.variable} as createSingletonServices } from '${getFileImportRelativePath(nextJSfile, singletonServicesFactory.file, packageMappings)}'`
      const sessionServicesImport = `import { ${sessionServicesFactory.variable} as createSessionServices } from '${getFileImportRelativePath(nextJSfile, sessionServicesFactory.file, packageMappings)}'`
      const userSessionImport = `import type { ${userSessionType.type} as UserSession } from '${getFileImportRelativePath(nextJSfile, userSessionType.file, packageMappings)}'`

      const routesPath = getFileImportRelativePath(
        nextJSfile,
        routesFile,
        packageMappings
      )
      const routesMapDeclarationPath = getFileImportRelativePath(
        nextJSfile,
        routesMapDeclarationFile,
        packageMappings
      )
      const schemasPath = getFileImportRelativePath(
        nextJSfile,
        `${schemaDirectory}/register.gen.ts`,
        packageMappings
      )

      const content = serializeNextJsWrapper(
        routesPath,
        routesMapDeclarationPath,
        schemasPath,
        pikkuConfigImport,
        singletonServicesImport,
        sessionServicesImport,
        userSessionImport
      )
      await writeFileInDir(nextJSfile, content)
    }
  )
}

export const action = async (options: PikkuCLIOptions): Promise<void> => {
  logPikkuLogo()
  const cliConfig = await getPikkuCLIConfig(
    options.config,
    ['rootDir', 'schemaDirectory', 'configDir', 'nextJSfile'],
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
