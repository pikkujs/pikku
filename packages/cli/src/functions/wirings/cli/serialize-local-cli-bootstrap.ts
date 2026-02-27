import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type { Config } from '../../../../types/application-types.js'

/**
 * Serializes the local (in-program) CLI bootstrap code
 */
export function serializeLocalCLIBootstrap(
  programName: string,
  _programMeta: any,
  bootstrapFile: string,
  config: Config,
  pikkuConfigFactory: { file: string; variable: string } | undefined,
  singletonServicesFactory: { file: string; variable: string },
  wireServicesFactory?: { file: string; variable: string }
): string {
  const capitalizedName =
    programName.charAt(0).toUpperCase() + programName.slice(1).replace(/-/g, '')

  const pikkuConfigPath = pikkuConfigFactory
    ? getFileImportRelativePath(
        bootstrapFile,
        pikkuConfigFactory.file,
        config.packageMappings
      )
    : null
  const singletonServicesPath = getFileImportRelativePath(
    bootstrapFile,
    singletonServicesFactory.file,
    config.packageMappings
  )
  const wireServicesPath = wireServicesFactory
    ? getFileImportRelativePath(
        bootstrapFile,
        wireServicesFactory.file,
        config.packageMappings
      )
    : null
  const cliBootstrapPath = getFileImportRelativePath(
    bootstrapFile,
    config.bootstrapFile,
    config.packageMappings
  )

  return `
import { executeCLI, CLIError } from '@pikku/core/cli'
${pikkuConfigFactory ? `import { ${pikkuConfigFactory.variable} as createConfig } from '${pikkuConfigPath}'` : ''}
import { ${singletonServicesFactory.variable} as createSingletonServices } from '${singletonServicesPath}'
${wireServicesFactory ? `import { ${wireServicesFactory.variable} as createWireServices } from '${wireServicesPath}'` : ''}
import '${cliBootstrapPath}'

export async function ${capitalizedName}CLI(args: string[]): Promise<void> {
  try {
    await executeCLI({
      programName: '${programName}',
      args: args || process.argv.slice(2),
${pikkuConfigFactory ? '      createConfig,' : ''}
      createSingletonServices,
${wireServicesFactory ? '      createWireServices,' : ''}
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
