import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { getPikkuFilesAndMethods } from '../../../utils/pikku-files-and-methods.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import type { PikkuCLIConfig } from '../../../../types/config.js'
import { join } from 'node:path'

export const pikkuCLIBootstrap = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, cliConfig, getInspectorState }) => {
    const visitState = await getInspectorState()
    const config = cliConfig

    // Generate bootstrap files for each program
    for (const [programName, programMeta] of Object.entries(
      visitState.cli.meta
    )) {
      // Generate two variants: local and HTTP RPC
      const variants = [
        { suffix: '', mode: 'local' as const },
        { suffix: '-rpc-http', mode: 'http-rpc' as const },
      ]

      for (const { suffix, mode } of variants) {
        const bootstrapFile = join(
          config.outDir,
          'cli',
          `pikku-bootstrap-${programName}-cli${suffix}.gen.ts`
        )

        // Get service factories (only needed for local mode)
        if (mode === 'local') {
          const { singletonServicesFactory, sessionServicesFactory } =
            await getPikkuFilesAndMethods(
              logger,
              visitState,
              config.packageMappings,
              bootstrapFile,
              {}, // options
              {
                singletonServicesFactory: true,
                sessionServicesFactory: true,
              }
            )

          const bootstrapCode = generateCLIBootstrap(
            programName,
            programMeta,
            bootstrapFile,
            config,
            singletonServicesFactory,
            sessionServicesFactory,
            mode
          )

          await writeFileInDir(logger, bootstrapFile, bootstrapCode)
          logger.info(
            `Generated ${mode} CLI bootstrap for ${programName}: ${bootstrapFile}`
          )
        } else {
          // RPC modes don't need service factories
          const bootstrapCode = generateCLIBootstrap(
            programName,
            programMeta,
            bootstrapFile,
            config,
            { file: '', variable: '' },
            { file: '', variable: '' },
            mode
          )

          await writeFileInDir(logger, bootstrapFile, bootstrapCode)
          logger.info(
            `Generated ${mode} CLI bootstrap for ${programName}: ${bootstrapFile}`
          )
        }
      }
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating CLI bootstrap',
      commandEnd: 'Generated CLI bootstrap',
      skipCondition: async ({ getInspectorState }) => {
        const visitState = await getInspectorState()
        return visitState.cli.files.size === 0
      },
      skipMessage: 'none found',
    }),
  ],
})

/**
 * Generates the CLI bootstrap code for a specific program
 */
function generateCLIBootstrap(
  programName: string,
  programMeta: any,
  bootstrapFile: string,
  config: PikkuCLIConfig,
  singletonServicesFactory: { file: string; variable: string },
  sessionServicesFactory: { file: string; variable: string },
  mode: 'local' | 'http-rpc'
): string {
  if (mode === 'local') {
    return generateLocalCLIBootstrap(
      programName,
      programMeta,
      bootstrapFile,
      config,
      singletonServicesFactory,
      sessionServicesFactory
    )
  } else if (mode === 'http-rpc') {
    return generateHTTPRPCCLIBootstrap(
      programName,
      programMeta,
      bootstrapFile,
      config
    )
  }

  throw new Error(`Unknown CLI mode: ${mode}`)
}

/**
 * Generates the local (in-program) CLI bootstrap code
 */
function generateLocalCLIBootstrap(
  programName: string,
  programMeta: any,
  bootstrapFile: string,
  config: PikkuCLIConfig,
  singletonServicesFactory: { file: string; variable: string },
  sessionServicesFactory: { file: string; variable: string }
): string {
  const capitalizedName =
    programName.charAt(0).toUpperCase() + programName.slice(1).replace(/-/g, '')

  // Get relative import paths
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
  const cliWiringsPath = getFileImportRelativePath(
    bootstrapFile,
    config.cliWiringsFile,
    config.packageMappings
  )
  const cliMetaPath = getFileImportRelativePath(
    bootstrapFile,
    config.cliWiringMetaFile,
    config.packageMappings
  )
  const functionsMetaPath = getFileImportRelativePath(
    bootstrapFile,
    config.functionsMetaFile,
    config.packageMappings
  )
  const schemasPath = getFileImportRelativePath(
    bootstrapFile,
    `${config.schemaDirectory}/register.gen.ts`,
    config.packageMappings
  )

  return `/**
 * This file was generated by the @pikku/cli
 */
import { parseCLIArguments, runCLICommand, generateCommandHelp, pikkuState } from '@pikku/core'
import { ${singletonServicesFactory.variable} as createSingletonServices } from '${singletonServicesPath}'
import { ${sessionServicesFactory.variable} as createSessionServices } from '${sessionServicesPath}'
import '${cliMetaPath}'
import '${functionsMetaPath}'
import '${cliWiringsPath}'
import '${schemasPath}'

/**
 * ${capitalizedName} CLI function
 * Handles command line arguments and executes the appropriate function
 */
export async function ${capitalizedName}CLI(args: string[] = process.argv.slice(2)): Promise<void> {
  try {
    // Get CLI metadata from state
    const allCLIMeta = pikkuState('cli', 'meta') || {}
    const programMeta = allCLIMeta['${programName}']

    if (!programMeta) {
      console.error('Error: CLI program "${programName}" not found')
      process.exit(1)
    }

    // Handle help
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
      showHelp(programMeta)
      return
    }

    // Parse arguments for this specific program
    const parsed = parseCLIArguments(args, '${programName}', allCLIMeta)

    if (parsed.errors.length > 0) {
      console.error('Errors:')
      parsed.errors.forEach(error => console.error(\`  \${error}\`))
      process.exit(1)
    }

    // Create services
    const singletonServices = await createSingletonServices()

    // Merge positionals and options into single data object
    const data = { ...parsed.positionals, ...parsed.options }

    // Execute the command
    await runCLICommand({
      program: '${programName}',
      commandPath: parsed.commandPath,
      data,
      singletonServices,
      createSessionServices,
    })

  } catch (error: any) {
    console.error('Error:', error.message)

    // Show stack trace in verbose mode
    if (args.includes('--verbose') || args.includes('-v')) {
      console.error('Stack trace:', error.stack)
    }

    process.exit(1)
  }
}

/**
 * Show help for the CLI program
 */
function showHelp(programMeta: any): void {
  console.log(\`Usage: ${programName} [options] <command>\`)
  console.log()

  if (programMeta.description) {
    console.log(programMeta.description)
    console.log()
  }

  // Show global options
  if (programMeta.options && Object.keys(programMeta.options).length > 0) {
    console.log('Global Options:')
    for (const [name, option] of Object.entries(programMeta.options)) {
      const opt = option as any
      const short = opt.short ? \`-\${opt.short}, \` : ''
      const defaultVal = opt.default !== undefined ? \` (default: \${opt.default})\` : ''
      console.log(\`  \${short}--\${name}  \${opt.description || ''}\${defaultVal}\`)
    }
    console.log()
  }

  // Show commands
  if (programMeta.commands && Object.keys(programMeta.commands).length > 0) {
    console.log('Commands:')
    showCommandsHelp(programMeta.commands, '')
  }

  console.log()
  console.log('Use --help with any command for more details')
}

/**
 * Recursively show commands help
 */
function showCommandsHelp(commands: any, prefix: string): void {
  for (const [name, command] of Object.entries(commands)) {
    const cmd = command as any
    const fullName = prefix ? \`\${prefix} \${name}\` : name

    if (cmd.command) {
      // Leaf command
      console.log(\`  \${fullName.padEnd(20)} \${cmd.description || ''}\`)
    } else if (cmd.subcommands) {
      // Command group
      console.log(\`  \${fullName.padEnd(20)} \${cmd.description || ''}\`)
      showCommandsHelp(cmd.subcommands, fullName)
    }
  }
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

/**
 * Generates the HTTP RPC CLI bootstrap code
 */
function generateHTTPRPCCLIBootstrap(
  programName: string,
  _programMeta: any,
  bootstrapFile: string,
  config: PikkuCLIConfig
): string {
  const capitalizedName =
    programName.charAt(0).toUpperCase() + programName.slice(1).replace(/-/g, '')

  // Get relative import paths
  const cliMetaPath = getFileImportRelativePath(
    bootstrapFile,
    config.cliWiringMetaFile,
    config.packageMappings
  )
  const functionsMetaPath = getFileImportRelativePath(
    bootstrapFile,
    config.functionsMetaFile,
    config.packageMappings
  )
  const rpcClientPath = getFileImportRelativePath(
    bootstrapFile,
    config.rpcWiringsFile || config.fetchFile || '.pikku/pikku-rpc.gen.ts',
    config.packageMappings
  )

  return `/**
 * This file was generated by the @pikku/cli
 * HTTP RPC CLI - Makes HTTP RPC calls instead of running functions locally
 */
import { parseCLIArguments, pikkuState } from '@pikku/core'
import { pikkuRPC } from '${rpcClientPath}'
import '${cliMetaPath}'
import '${functionsMetaPath}'

/**
 * ${capitalizedName} CLI (HTTP RPC mode)
 * Parses arguments and calls RPC methods via HTTP
 */
export async function ${capitalizedName}CLI(args: string[] = process.argv.slice(2), rpcURL: string = process.env.RPC_URL || 'http://localhost:3000'): Promise<void> {
  try {
    // Get CLI metadata from state
    const allCLIMeta = pikkuState('cli', 'meta') || {}
    const programMeta = allCLIMeta['${programName}']
    const functionsMeta = pikkuState('function', 'meta') || {}

    if (!programMeta) {
      console.error('Error: CLI program "${programName}" not found')
      process.exit(1)
    }

    // Handle help
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
      showHelp(programMeta)
      return
    }

    // Parse arguments for this specific program
    const parsed = parseCLIArguments(args, '${programName}', allCLIMeta)

    if (parsed.errors.length > 0) {
      console.error('Errors:')
      parsed.errors.forEach(error => console.error(\`  \${error}\`))
      process.exit(1)
    }

    // Find the function name for this command
    let currentCommand = programMeta.commands[parsed.commandPath[0]]
    if (!currentCommand) {
      console.error(\`Command not found: \${parsed.commandPath.join(' ')}\`)
      process.exit(1)
    }

    for (let i = 1; i < parsed.commandPath.length; i++) {
      if (!currentCommand.subcommands || !currentCommand.subcommands[parsed.commandPath[i]]) {
        console.error(\`Command not found: \${parsed.commandPath.join(' ')}\`)
        process.exit(1)
      }
      currentCommand = currentCommand.subcommands[parsed.commandPath[i]]
    }

    const funcName = currentCommand.pikkuFuncName
    const funcMeta = functionsMeta[funcName]

    // Check if function is exposed
    if (!funcMeta?.expose) {
      console.error(\`Error: Function "\${funcName}" is not exposed for RPC access\`)
      console.error('Add { expose: true } to the function configuration to enable RPC CLI')
      process.exit(1)
    }

    // Set server URL
    pikkuRPC.setServerUrl(rpcURL)

    // Merge positionals and options into single data object
    const data = { ...parsed.positionals, ...parsed.options }

    // Set authentication if provided in options
    if (data.authToken) {
      pikkuRPC.setAuthorizationJWT(data.authToken)
      delete data.authToken
    }
    if (data.apiKey) {
      pikkuRPC.setAPIKey(data.apiKey)
      delete data.apiKey
    }

    // Call the RPC method
    const result = await pikkuRPC.invoke(funcName as any, data)

    // Output result as JSON
    console.log(JSON.stringify(result, null, 2))

  } catch (error: any) {
    console.error('Error:', error.message)

    // Show stack trace in verbose mode
    if (args.includes('--verbose') || args.includes('-v')) {
      console.error('Stack trace:', error.stack)
    }

    process.exit(1)
  }
}

/**
 * Show help for the CLI program
 */
function showHelp(programMeta: any): void {
  console.log(\`Usage: ${programName} [options] <command>\`)
  console.log()
  console.log('Note: This CLI uses HTTP RPC to call remote functions')
  console.log('Set RPC_URL environment variable to change the RPC endpoint (default: http://localhost:3000)')
  console.log()

  if (programMeta.description) {
    console.log(programMeta.description)
    console.log()
  }

  // Show global options
  if (programMeta.options && Object.keys(programMeta.options).length > 0) {
    console.log('Global Options:')
    for (const [name, option] of Object.entries(programMeta.options)) {
      const opt = option as any
      const short = opt.short ? \`-\${opt.short}, \` : ''
      const defaultVal = opt.default !== undefined ? \` (default: \${opt.default})\` : ''
      console.log(\`  \${short}--\${name}  \${opt.description || ''}\${defaultVal}\`)
    }
    console.log()
  }

  // Show commands
  if (programMeta.commands && Object.keys(programMeta.commands).length > 0) {
    console.log('Commands:')
    showCommandsHelp(programMeta.commands, '')
  }

  console.log()
  console.log('Use --help with any command for more details')
}

/**
 * Recursively show commands help
 */
function showCommandsHelp(commands: any, prefix: string): void {
  for (const [name, command] of Object.entries(commands)) {
    const cmd = command as any
    const fullName = prefix ? \`\${prefix} \${name}\` : name

    if (cmd.command) {
      // Leaf command
      console.log(\`  \${fullName.padEnd(20)} \${cmd.description || ''}\`)
    } else if (cmd.subcommands) {
      // Command group
      console.log(\`  \${fullName.padEnd(20)} \${cmd.description || ''}\`)
      showCommandsHelp(cmd.subcommands, fullName)
    }
  }
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
