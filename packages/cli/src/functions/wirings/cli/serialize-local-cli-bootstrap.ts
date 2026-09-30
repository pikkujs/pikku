import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type { Config } from '../../../../types/application-types.js'
import { DIRECT_EXECUTION_GUARD } from './serialize-cli-entrypoint-guard.js'

/**
 * Serializes the local (in-program) CLI bootstrap code.
 *
 * The app's createSingletonServices is handed the services
 * `pikku-local-services.gen.ts` assembles — the set `pikku serve` injects — so a
 * command run here sees the same database-backed services a request to the dev
 * server does, rather than whatever the factory falls back to on its own.
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
  const localServicesPath = getFileImportRelativePath(
    bootstrapFile,
    config.localServicesFile,
    config.packageMappings
  )
  const cliBootstrapPath = getFileImportRelativePath(
    bootstrapFile,
    config.bootstrapFile,
    config.packageMappings
  )

  return `
import { executeCLI, CLIError, formatCLIError, wantsStackTrace } from '@pikku/core/cli'
${pikkuConfigFactory ? `import { ${pikkuConfigFactory.variable} as createConfig } from '${pikkuConfigPath}'` : ''}
import { ${singletonServicesFactory.variable} as createSingletonServices } from '${singletonServicesPath}'
import { createLocalServices } from '${localServicesPath}'
${wireServicesFactory ? `import { ${wireServicesFactory.variable} as createWireServices } from '${wireServicesPath}'` : ''}
import '${cliBootstrapPath}'

export async function ${capitalizedName}CLI(args: string[]): Promise<void> {
  try {
    await executeCLI({
      programName: '${programName}',
      args: args || process.argv.slice(2),
${pikkuConfigFactory ? '      createConfig,' : ''}
      createSingletonServices: async (config) =>
        createSingletonServices(config, await createLocalServices(config)),
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
${DIRECT_EXECUTION_GUARD}

if (isDirectExecution) {
  const reportFatal = (error: unknown): void => {
    // executeCLI already printed a CLIError; it carries the exit code, not text.
    if (error instanceof CLIError) process.exit(error.exitCode)
    // stderr is asynchronous when it is a pipe, so exiting on the next line can
    // truncate the diagnostic. Exit from the write callback, with exitCode set
    // first in case the stream is already gone and the callback never fires.
    process.exitCode = 1
    process.stderr.write(
      formatCLIError(error, { verbose: wantsStackTrace(process.argv.slice(2)) }) + '\\n',
      () => process.exit(1)
    )
  }
  process.on('uncaughtException', reportFatal)
  process.on('unhandledRejection', reportFatal)
  ${capitalizedName}CLI(process.argv.slice(2)).catch(reportFatal)
}
`
}
