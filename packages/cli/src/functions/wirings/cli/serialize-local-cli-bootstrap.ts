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
  interactionServicesFactory: { file: string; variable: string }
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
  const interactionServicesPath = getFileImportRelativePath(
    bootstrapFile,
    interactionServicesFactory.file,
    config.packageMappings
  )
  const cliBootstrapPath = getFileImportRelativePath(
    bootstrapFile,
    config.bootstrapFile,
    config.packageMappings
  )

  return `
import { executeCLI, CLIError } from '@pikku/core/cli'
import { ${pikkuConfigFactory.variable} as createConfig } from '${pikkuConfigPath}'
import { ${singletonServicesFactory.variable} as createSingletonServices } from '${singletonServicesPath}'
import { ${interactionServicesFactory.variable} as createInteractionServices } from '${interactionServicesPath}'
import '${cliBootstrapPath}'

/**
 * ${capitalizedName} CLI function
 * Handles command line arguments and executes the appropriate function
 */
export async function ${capitalizedName}CLI(args: string[]): Promise<void> {
  try {
    await executeCLI({
      programName: '${programName}',
      args: args || process.argv.slice(2),
      createConfig,
      createSingletonServices,
      createInteractionServices,
    })
  } catch (error) {
    if (error instanceof CLIError) {
      process.exit(error.exitCode)
    }
    throw error
  }
}

// Export as default for easy importing
export default ${capitalizedName}CLI

// For direct execution (if this file is run directly)
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  ${capitalizedName}CLI(process.argv.slice(2)).catch(error => {
    console.error('Fatal error:', error.message)
    process.exit(1)
  })
}
`
}
