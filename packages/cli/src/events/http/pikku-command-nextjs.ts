import { PikkuCLIConfig } from '../../pikku-cli-config.js'
import { serializeNextJsBackendWrapper as serializeNextBackendWrapper } from '../../runtimes/nextjs/serialize-nextjs-backend-wrapper.js'
import { serializeNextJsHTTPWrapper as serializeNextHTTPWrapper } from '../../runtimes/nextjs/serialize-nextjs-http-wrapper.js'
import {
  getFileImportRelativePath,
  getPikkuFilesAndMethods,
  logCommandInfoAndTime,
  writeFileInDir,
} from '../../utils.js'
import { PikkuCommand } from '../../types.js'

export const pikkuNext: PikkuCommand = async (
  logger,
  {
    nextBackendFile,
    nextHTTPFile,
    httpRoutesMapDeclarationFile,
    packageMappings,
    fetchFile,
    bootstrapFiles,
  }: PikkuCLIConfig,
  visitState,
  options = {}
) => {
  return await logCommandInfoAndTime(
    logger,
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
          httpRoutesMapDeclarationFile,
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
          httpRoutesMapDeclarationFile,
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
    }
  )
}
