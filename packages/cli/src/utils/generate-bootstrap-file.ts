import { Config } from '../../types/application-types.js'
import { CLILogger } from '../services/cli-logger.service.js'
import { getFileImportRelativePath } from './file-import-path.js'
import { writeFileInDir } from './file-writer.js'

export const generateBootstrapFile = async (
  logger: CLILogger,
  config: Config,
  bootstrapFile: string,
  specificImports: string[],
  schemas?: boolean
) => {
  // Common imports that every bootstrap file needs
  const commonImports = [config.functionsMetaMinFile, config.functionsFile]

  // Add schema if it exists
  if (schemas) {
    commonImports.push(`${config.schemaDirectory}/register.gen.ts`)
  }

  // Combine common imports with specific imports
  const allImports = [...commonImports, ...specificImports]

  await writeFileInDir(
    logger,
    bootstrapFile,
    allImports
      .map(
        (to) =>
          `import '${getFileImportRelativePath(bootstrapFile, to, config.packageMappings)}'`
      )
      .sort((to) => (to.includes('meta') ? -1 : 1)) // Ensure meta files are at the top
      .join('\n')
  )
}
