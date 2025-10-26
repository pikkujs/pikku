import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { checkRequiredTypes } from '../../../utils/check-required-types.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeNextJsBackendWrapper as serializeNextBackendWrapper } from './serialize-nextjs-backend-wrapper.js'
import { serializeNextJsHTTPWrapper as serializeNextHTTPWrapper } from './serialize-nextjs-http-wrapper.js'

export const pikkuNext: any = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const {
      nextBackendFile,
      nextHTTPFile,
      httpMapDeclarationFile,
      packageMappings,
      fetchFile,
    } = config

    // If both files are undefined, clean up any existing files and return
    if (!nextBackendFile && !nextHTTPFile) {
      logger.info({
        message:
          'Skipping generating nextjs wrapper since nextjs outfile is not defined.',
        type: 'skip',
      })
      return
    }

    const visitState = await getInspectorState()

    if (nextHTTPFile && !fetchFile) {
      throw new Error(
        'fetchFile is required in pikku config in order for nextJS http wrapper to work'
      )
    }

    if (nextBackendFile) {
      // Check for required types
      checkRequiredTypes(visitState.filesAndMethodsErrors, {
        config: true,
        singletonServicesFactory: true,
        sessionServicesFactory: true,
      })

      const {
        pikkuConfigFactory,
        singletonServicesFactory,
        sessionServicesFactory,
      } = visitState.filesAndMethods

      if (
        !pikkuConfigFactory ||
        !singletonServicesFactory ||
        !sessionServicesFactory
      ) {
        throw new Error('Required types not found')
      }

      const pikkuConfigImport = `import { ${pikkuConfigFactory.variable} as createConfig } from '${getFileImportRelativePath(nextBackendFile, pikkuConfigFactory.file, packageMappings)}'`
      const singletonServicesImport = `import { ${singletonServicesFactory.variable} as createSingletonServices } from '${getFileImportRelativePath(nextBackendFile, singletonServicesFactory.file, packageMappings)}'`
      const sessionServicesImport = `import { ${sessionServicesFactory.variable} as createSessionServices } from '${getFileImportRelativePath(nextBackendFile, sessionServicesFactory.file, packageMappings)}'`

      const bootstrapPath = getFileImportRelativePath(
        nextBackendFile,
        config.bootstrapFile,
        packageMappings
      )

      const routesMapDeclarationPath = getFileImportRelativePath(
        nextBackendFile,
        httpMapDeclarationFile,
        packageMappings
      )

      const content = serializeNextBackendWrapper(
        bootstrapPath,
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
    }),
  ],
})
