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
 * Default JSON renderer for CLI output
 */
const defaultJSONRenderer: CorePikkuCLIRender<any> = (_services, data) => {
  console.log(JSON.stringify(data, null, 2))
}

/**
 * Registers a CLI command tree and all its functions
 */
export const wireCLI = <
  Commands,
  GlobalOptions,
  PikkuMiddleware extends CorePikkuMiddleware,
  GlobalOutput,
>(
  cli: CoreCLI<Commands, GlobalOptions, PikkuMiddleware, GlobalOutput>
) => {
  // Get the existing metadata that was generated during inspection
  const cliMeta = pikkuState('cli', 'meta') || {}

  if (!cliMeta[cli.program]) {
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
  const cliMeta = pikkuState('cli', 'meta')[program]

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

    // Store the options in program state for use during execution
    const programs: Record<string, CLIProgramState> = pikkuState(
      'cli',
      'programs'
    )
    if (programs[program]) {
      if (!programs[program].commandOptions) {
        programs[program].commandOptions = {}
      }
      programs[program].commandOptions![commandId] = mergedOptions
    }

    // Unwrap the function from pikku wrappers
    const unwrapped = unwrapFunc(command)

    addFunction(funcName, {
      func: unwrapped.func,
      auth: unwrapped.auth,
      permissions: unwrapped.permissions,
      middleware: unwrapped.middleware,
      tags: unwrapped.tags,
    })

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
  const programMeta = cliMeta[program]
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
  const programMiddleware = programData?.middleware || []

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
        channel,
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
        middleware: programMiddleware,
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
 */
export async function executeCLI({
  programName,
  args = process.argv.slice(2),
  createConfig,
  createSingletonServices,
  createSessionServices,
}: {
  programName: string
  args?: string[]
  createConfig: CreateConfig<any, any>
  createSingletonServices: CreateSingletonServices<any, any>
  createSessionServices?: CreateSessionServices<any, any>
}): Promise<void> {
  try {
    // Get CLI metadata from state
    const allCLIMeta = pikkuState('cli', 'meta') || {}
    const programMeta = allCLIMeta[programName]

    if (!programMeta) {
      console.error(`Error: CLI program "${programName}" not found`)
      process.exit(1)
    }

    // Parse arguments for this specific program
    const parsed = parseCLIArguments(args, programName, allCLIMeta)

    // Handle help (check after parsing to support subcommand help)
    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
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
        process.exit(1)
      } else {
        // Show errors for other types of errors
        console.error('Errors:')
        parsed.errors.forEach((error) => console.error(`  ${error}`))
        process.exit(1)
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
    console.error('Error:', error)

    // Show stack trace in verbose mode
    if (args.includes('--verbose') || args.includes('-v')) {
      console.error('Stack trace:', error.stack)
    }

    process.exit(1)
  }
}
