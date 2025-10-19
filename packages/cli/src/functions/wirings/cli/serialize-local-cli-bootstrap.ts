import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { Config } from '../../../../types/application-types.js'

/**
 * Serializes the local (in-program) CLI bootstrap code
 */
export function serializeLocalCLIBootstrap(
  programName: string,
  _programMeta: any,
  bootstrapFile: string,
  config: Config,
  pikkuConfigFactory: { file: string; variable: string },
  singletonServicesFactory: { file: string; variable: string },
  sessionServicesFactory: { file: string; variable: string }
): string {
  const capitalizedName =
    programName.charAt(0).toUpperCase() + programName.slice(1).replace(/-/g, '')

  // Get relative import paths
  const pikkuConfigPath = getFileImportRelativePath(
    bootstrapFile,
    pikkuConfigFactory.file,
    config.packageMappings
  )
  const singletonServicesPath = getFileImportRelativePath(
    bootstrapFile,
    singletonServicesFactory.file,
    config.packageMappings
  )
  const sessionServicesPath = getFileImportRelativePath(
    bootstrapFile,
    sessionServicesFactory.file,
    config.packageMappings
  )
  const cliBootstrapPath = getFileImportRelativePath(
    bootstrapFile,
    config.bootstrapFile,
    config.packageMappings
  )

  return `
import { executeCLI } from '@pikku/core'
import { ${pikkuConfigFactory.variable} as createConfig } from '${pikkuConfigPath}'
import { ${singletonServicesFactory.variable} as createSingletonServices } from '${singletonServicesPath}'
import { ${sessionServicesFactory.variable} as createSessionServices } from '${sessionServicesPath}'
import '${cliBootstrapPath}'

/**
 * ${capitalizedName} CLI function
 * Handles command line arguments and executes the appropriate function
 */
export async function ${capitalizedName}CLI(args?: string[]): Promise<void> {
  await executeCLI({
    programName: '${programName}',
    args,
    createConfig,
    createSingletonServices,
    createSessionServices,
  })
}

// Export as default for easy importing
export default ${capitalizedName}CLI

// For direct execution (if this file is run directly)
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  ${capitalizedName}CLI().catch(error => {
    console.error('Fatal error:', error.message)
    process.exit(1)
  })
}
`
}
