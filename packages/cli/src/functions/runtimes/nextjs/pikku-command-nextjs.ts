import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { getPikkuFilesAndMethods } from '../../../utils/pikku-files-and-methods.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeNextJsBackendWrapper as serializeNextBackendWrapper } from './serialize-nextjs-backend-wrapper.js'
import { serializeNextJsHTTPWrapper as serializeNextHTTPWrapper } from './serialize-nextjs-http-wrapper.js'

export const pikkuNext = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const {
      nextBackendFile,
      nextHTTPFile,
      httpMapDeclarationFile,
      packageMappings,
      fetchFile,
      bootstrapFiles,
    } = cliConfig
    const visitState = await getInspectorState()
    const options = {}

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
        logger,
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

      const httpBootstrapPath = getFileImportRelativePath(
        nextBackendFile,
        bootstrapFiles.http,
        packageMappings
      )

      const routesMapDeclarationPath = getFileImportRelativePath(
        nextBackendFile,
        httpMapDeclarationFile,
        packageMappings
      )

      const content = serializeNextBackendWrapper(
        httpBootstrapPath,
        routesMapDeclarationPath,
        pikkuConfigImport,
        singletonServicesImport,
        sessionServicesImport
      )
      await writeFileInDir(logger, nextBackendFile, content)
    }

    if (nextHTTPFile && fetchFile) {
      const routesMapDeclarationPath = getFileImportRelativePath(
        nextHTTPFile,
        httpMapDeclarationFile,
        packageMappings
      )

      const fetchPath = getFileImportRelativePath(
        nextHTTPFile,
        fetchFile,
        packageMappings
      )

      const content = serializeNextHTTPWrapper(
        routesMapDeclarationPath,
        fetchPath
      )
      await writeFileInDir(logger, nextHTTPFile, content)
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating nextjs wrapper',
      commandEnd: 'Generated nextjs wrapper',
      skipCondition: ({ cliConfig }) =>
        cliConfig.nextBackendFile === undefined &&
        cliConfig.nextHTTPFile === undefined,
      skipMessage: 'nextjs outfile is not defined',
    }),
  ],
})
