import { NotFoundError } from '../../errors/errors.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import {
  CorePikkuMiddleware,
  CoreUserSession,
  SessionServices,
  PikkuWiringTypes,
} from '../../types/core.types.js'
import { closeSessionServices } from '../../utils.js'
import {
  CoreCLI,
  CLICommandMeta,
  CLIOption,
  CLIProgramState,
  CorePikkuCLIRender,
  CoreCLICommandConfig,
  CLIMeta,
} from './cli.types.js'
import type {
  CoreSingletonServices,
  CoreServices,
  CreateSessionServices,
  PikkuInteraction,
  CreateConfig,
  CreateSingletonServices,
} from '../../types/core.types.js'
import { PikkuChannel } from '../channel/channel.types.js'
import { rpcService } from '../rpc/rpc-runner.js'
import { PikkuUserSessionService } from '../../services/user-session-service.js'
import { LocalVariablesService } from '../../services/local-variables.js'
import { generateCommandHelp, parseCLIArguments } from './command-parser.js'

/**
 * CLI command execution error - thrown when CLI execution fails
 * Should be caught by the wrapper to call process.exit()
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message)
    this.name = 'CLIError'
  }
}

/**
 * Default JSON renderer for CLI output
 */
const defaultJSONRenderer: CorePikkuCLIRender<any> = (_services, data) => {
  console.log(JSON.stringify(data, null, 2))
}

/**
 * Registers a CLI command tree and all its functions
 */
export const wireCLI = <
  Commands extends Record<string, CoreCLICommandConfig<any, any, any>>,
  GlobalOptions,
  PikkuMiddleware extends CorePikkuMiddleware,
  GlobalOutput,
>(
  cli: CoreCLI<Commands, GlobalOptions, PikkuMiddleware, GlobalOutput>
) => {
  // Get the existing metadata that was generated during inspection
  const cliMeta = pikkuState('cli', 'meta') || {}

  if (!cliMeta.programs?.[cli.program]) {
    throw new Error(
      `CLI metadata not found for program '${cli.program}'. Did you run 'pikku all'?`
    )
  }

  // Get existing programs state and add this program
  const programs: Record<string, CLIProgramState> =
    pikkuState('cli', 'programs') || {}
  programs[cli.program] = {
    defaultRenderer: (cli.render ||
      defaultJSONRenderer) as CorePikkuCLIRender<any>,
    middleware: cli.middleware || [],
    renderers: {},
    tags: cli.tags,
  }
  pikkuState('cli', 'programs', programs)

  // Register all command functions recursively
  registerCLICommands(
    cli.commands as Record<string, any>,
    [],
    cli.options || {},
    cli.program
  )
}

/**
 * Unwraps a function from pikku wrappers (pikkuFunc, pikkuSessionlessFunc, etc.)
 * These wrappers return { func, middleware, ... } but we need the actual function
 */
function unwrapFunc(command: any): {
  func: Function
  middleware?: any[]
  auth?: boolean
  permissions?: any
  tags?: string[]
} {
  if (typeof command === 'function') {
    return { func: command }
  }

  // If command has a func property that's an object with func, unwrap it
  if (
    command.func &&
    typeof command.func === 'object' &&
    'func' in command.func
  ) {
    return {
      func: command.func.func,
      middleware: command.func.middleware,
      auth: command.func.auth,
      permissions: command.func.permissions,
      tags: command.func.tags,
    }
  }

  // Otherwise return as-is
  return command
}

/**
 * Registers CLI commands and their functions recursively
 */
function registerCLICommands(
  commands: Record<string, any>,
  path: string[] = [],
  inheritedOptions: Record<string, CLIOption> = {},
  program: string
) {
  // Get the CLI metadata to find actual function names
  const cliMeta = pikkuState('cli', 'meta').programs[program]

  for (const [name, command] of Object.entries(commands)) {
    const fullPath = [...path, name]
    const commandId = fullPath.join('.')

    // Navigate metadata to find the actual function name
    let currentMeta: CLICommandMeta | undefined = cliMeta?.commands[fullPath[0]]
    for (let i = 1; i < fullPath.length; i++) {
      currentMeta = currentMeta?.subcommands?.[fullPath[i]]
    }
    const funcName = currentMeta?.pikkuFuncName

    // Skip if no function name (could be a command group)
    if (!funcName) {
      // Recursively register subcommands if they exist
      if (typeof command === 'object' && command.subcommands) {
        const commandOptions = command.options || {}
        const mergedOptions = { ...inheritedOptions, ...commandOptions }
        registerCLICommands(
          command.subcommands,
          fullPath,
          mergedOptions,
          program
        )
      }
      continue
    }

    // Merge options (inherited + local)
    const commandOptions =
      typeof command === 'object' ? command.options || {} : {}
    const mergedOptions = { ...inheritedOptions, ...commandOptions }

    // Store the options and middleware in program state for use during execution
    const programs: Record<string, CLIProgramState> = pikkuState(
      'cli',
      'programs'
    )
    if (programs[program]) {
      if (!programs[program].commandOptions) {
        programs[program].commandOptions = {}
      }
      programs[program].commandOptions![commandId] = mergedOptions

      // Store command middleware from the wire config
      if (typeof command === 'object' && command.middleware) {
        if (!programs[program].commandMiddleware) {
          programs[program].commandMiddleware = {}
        }
        programs[program].commandMiddleware![commandId] = command.middleware
      }
    }

    addFunction(funcName, unwrapFunc(command))

    // Register renderer if provided
    if (typeof command === 'object' && command.render) {
      if (programs[program]) {
        programs[program].renderers[commandId] = command.render
      }
    }

    // Recursively register subcommands
    if (typeof command === 'object' && command.subcommands) {
      registerCLICommands(command.subcommands, fullPath, mergedOptions, program)
    }
  }
}

/**
 * Plucks only the data that the function expects based on its schema
 */
function pluckCLIData(
  mergedData: Record<string, any>,
  funcName: string,
  availableOptions: Record<string, CLIOption>
): Record<string, any> {
  const funcMeta = pikkuState('function', 'meta')[funcName]
  const schemaName = funcMeta?.inputSchemaName
  const schema = schemaName
    ? pikkuState('misc', 'schemas').get(schemaName)
    : null

  if (schema && schema.properties) {
    // If we have a schema, only include fields that are in the schema
    const result: Record<string, any> = {}
    for (const key of Object.keys(schema.properties)) {
      if (key in mergedData) {
        result[key] = mergedData[key]
      } else if (availableOptions[key]?.default !== undefined) {
        // Apply default if not provided
        result[key] = availableOptions[key].default
      }
    }
    return result
  } else {
    // No schema, include all data
    return { ...mergedData }
  }
}

/**
 * Executes a CLI command for a specific program
 */
export async function runCLICommand({
  program,
  commandPath,
  data,
  singletonServices,
  createSessionServices,
}: {
  program: string
  commandPath: string[]
  data: Record<string, any>
  singletonServices: CoreSingletonServices
  createSessionServices?: CreateSessionServices
}): Promise<any> {
  // Get the command metadata to find the function name
  const cliMeta = pikkuState('cli', 'meta')
  const programMeta = cliMeta.programs?.[program]
  if (!programMeta) {
    throw new NotFoundError(`Program not found: ${program}`)
  }

  // Navigate command tree to find the function name
  let currentCommand = programMeta.commands[commandPath[0]]
  if (!currentCommand) {
    throw new NotFoundError(`Command not found: ${commandPath.join(' ')}`)
  }

  for (let i = 1; i < commandPath.length; i++) {
    if (
      !currentCommand.subcommands ||
      !currentCommand.subcommands[commandPath[i]]
    ) {
      throw new NotFoundError(`Command not found: ${commandPath.join(' ')}`)
    }
    currentCommand = currentCommand.subcommands[commandPath[i]]
  }

  const funcName = currentCommand.pikkuFuncName

  // Get program-specific data
  const programs: Record<string, CLIProgramState> =
    pikkuState('cli', 'programs') || {}
  const programData = programs[program]

  // Combine program middleware + command middleware from the hierarchy
  const allWireMiddleware: CorePikkuMiddleware[] = [
    ...(programData?.middleware || []),
  ]

  // Walk through the command path and collect middleware from the runtime config
  const commandParts: string[] = []
  for (const part of commandPath) {
    commandParts.push(part)
    const commandId = commandParts.join('.')
    const middleware = programData?.commandMiddleware?.[commandId]
    if (middleware) {
      allWireMiddleware.push(...middleware)
    }
  }

  // Get command ID and options
  const commandId = commandPath.join('.')
  const availableOptions = programData?.commandOptions?.[commandId] || {}

  // Pluck only the fields the function expects
  const pluckedData = () => pluckCLIData(data, funcName, availableOptions)

  // Get the renderer
  const renderer =
    programData?.renderers[commandId] || programData?.defaultRenderer

  // Create a CLI channel for progressive output
  const channel: PikkuChannel<unknown, unknown> = {
    channelId: `cli:${program}:${commandId}`,
    openingData: pluckedData,
    send: async (data: any) => {
      if (renderer) {
        await Promise.resolve(renderer(singletonServices, data, undefined))
      }
    },
    close: () => {
      if (channel) {
        channel.state = 'closed'
      }
    },
    state: 'open',
  }

  const userSession = new PikkuUserSessionService<CoreUserSession>()
  let sessionServices: SessionServices | undefined

  const interaction: PikkuInteraction = {
    cli: {
      program,
      command: commandPath,
      data: pluckedData,
      channel,
    },
  }

  const getAllServices = async (session?: CoreUserSession) => {
    // Create session-specific services for handling the command
    sessionServices = await createSessionServices?.(
      singletonServices,
      interaction,
      session
    )

    return rpcService.injectRPCService(
      {
        ...singletonServices,
        ...sessionServices,
        userSession,
      },
      interaction,
      false
    )
  }

  try {
    const result = await runPikkuFunc(
      PikkuWiringTypes.cli,
      commandId,
      funcName,
      {
        singletonServices,
        getAllServices,
        data: pluckedData,
        auth: false,
        userSession,
        inheritedMiddleware: currentCommand.middleware,
        wireMiddleware: allWireMiddleware,
        inheritedPermissions: currentCommand.permissions,
        wirePermissions: undefined,
        tags: programData?.tags,
        interaction,
      }
    )

    // Apply renderer one final time with the final output (if renderer exists)
    if (renderer) {
      await Promise.resolve(
        renderer(singletonServices, result, userSession.get())
      )
    }

    return result
  } finally {
    // Close the channel
    channel.close()

    // Clean up session services
    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
}

/**
 * Factory function for CLI-specific renderers
 */
export const pikkuCLIRender = <
  Data,
  Services extends CoreSingletonServices = CoreServices,
  Session extends CoreUserSession = CoreUserSession,
>(
  renderer: (
    services: Services,
    data: Data,
    session?: Session
  ) => void | Promise<void>
): CorePikkuCLIRender<Data, Services, Session> => {
  return renderer
}

/**
 * Execute a CLI program with the given arguments
 * This is the main entry point for CLI programs
 *
 * @throws {CLIError} When CLI execution fails - should be caught by wrapper to call process.exit()
 */
export async function executeCLI({
  programName,
  args,
  createConfig,
  createSingletonServices,
  createSessionServices,
}: {
  programName: string
  args?: string[]
  createConfig: CreateConfig<any, any>
  createSingletonServices: CreateSingletonServices<any, any>
  createSessionServices?: CreateSessionServices<any, any, any>
}): Promise<void> {
  if (!args) {
    throw new Error(
      'CLI arguments are required, this is to satisfy release diffs'
    )
  }

  try {
    // Get CLI metadata from state
    const allCLIMeta = pikkuState('cli', 'meta') as unknown as
      | CLIMeta
      | undefined
    if (!allCLIMeta) {
      throw new Error(
        '[PKU342] CLI metadata not found. No CLI wirings were registered. See https://pikku.dev/docs/pikku-cli/errors/pku342 for more information.'
      )
    }
    const programMeta = allCLIMeta.programs[programName]

    if (!programMeta) {
      throw new CLIError(`CLI program "${programName}" not found`, 1)
    }

    // Parse arguments for this specific program
    const parsed = parseCLIArguments(args, programName, allCLIMeta)

    // Handle help (check after parsing to support subcommand help)
    // Show help if --help/-h is present, or if no args AND no default command
    const shouldShowHelp =
      args.includes('--help') ||
      args.includes('-h') ||
      (args.length === 0 && parsed.commandPath.length === 0)

    if (shouldShowHelp) {
      const helpText = generateCommandHelp(
        programName,
        allCLIMeta,
        parsed.commandPath
      )
      console.log(helpText)
      return
    }

    if (parsed.errors.length > 0) {
      // Check if any error is about an unknown command
      const hasUnknownCommand = parsed.errors.some(
        (error) =>
          error.startsWith('Unknown command:') ||
          error.startsWith('Command not found:')
      )

      if (hasUnknownCommand) {
        // Show help instead of error for unknown commands
        const helpText = generateCommandHelp(
          programName,
          allCLIMeta,
          parsed.commandPath
        )
        console.log(helpText)
        throw new CLIError('Unknown command', 1)
      } else {
        // Show errors for other types of errors
        console.error('Errors:')
        parsed.errors.forEach((error) => console.error(`  ${error}`))
        throw new CLIError(parsed.errors.join('\n'), 1)
      }
    }

    // Merge positionals and options into single data object
    const data = { ...parsed.positionals, ...parsed.options }

    // Create config (pass data in case it needs to use any parsed options)
    const config = await createConfig(new LocalVariablesService(), data)

    // Create services with config
    const singletonServices = await createSingletonServices(config)

    // Execute the command
    await runCLICommand({
      program: programName,
      commandPath: parsed.commandPath,
      data,
      singletonServices,
      createSessionServices,
    })
  } catch (error: any) {
    // Re-throw CLIError as-is
    if (error instanceof CLIError) {
      throw error
    }

    // Wrap other errors in CLIError
    console.error('Error:', error)

    // Show stack trace in verbose mode
    if (args.includes('--verbose') || args.includes('-v')) {
      console.error('Stack trace:', error.stack)
    }

    throw new CLIError(error.message || String(error), 1)
  }
}
