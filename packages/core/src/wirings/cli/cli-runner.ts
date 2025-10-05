import { NotFoundError } from '../../errors/errors.js'
import { addFunction } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import {
  CorePikkuMiddleware,
  CoreUserSession,
  SessionServices,
  PikkuWiringTypes,
} from '../../types/core.types.js'
import { combineMiddleware, runMiddleware } from '../../middleware-runner.js'
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
} from '../../types/core.types.js'

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
    defaultRenderer: cli.render,
    globalMiddleware: cli.middleware || [],
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

    // Get the actual function
    const func = typeof command === 'function' ? command : command.func

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

    // Create a wrapper that handles option plucking
    const wrappedFunc = createCLIFunctionWrapper(
      func,
      funcName,
      mergedOptions,
      program,
      commandId
    )

    // Register the wrapped function (keep original name)
    const authValue =
      typeof command === 'object' && command.auth !== undefined
        ? command.auth
        : false
    addFunction(funcName, {
      func: wrappedFunc,
      // CLI functions should not require auth by default
      auth: authValue,
      permissions:
        typeof command === 'object' ? command.permissions : undefined,
    })

    // Register renderer if provided
    if (typeof command === 'object' && command.render) {
      const programs: Record<string, CLIProgramState> = pikkuState(
        'cli',
        'programs'
      )
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
 * Creates a wrapper function that handles CLI-specific logic
 */
function createCLIFunctionWrapper(
  func: Function,
  funcName: string,
  availableOptions: Record<string, CLIOption>,
  program: string,
  commandId: string
) {
  return async (services: any, receivedData: any, session?: any) => {
    // The data comes in as { program, commandPath, data }
    const { data = {} } = receivedData

    // Data is already merged
    const mergedData = data

    // Get function's expected input schema
    const funcMeta = pikkuState('function', 'meta')[funcName]
    const schemaName = funcMeta?.inputSchemaName
    const schema = schemaName
      ? pikkuState('misc', 'schemas').get(schemaName)
      : null

    // Pluck only the fields the function expects
    const pluckedData = pluckCLIData(mergedData, schema, availableOptions)

    // Execute the original function with plucked data
    const output = await func(services, pluckedData, session)

    // Apply renderer if present
    const programs: Record<string, CLIProgramState> = pikkuState(
      'cli',
      'programs'
    )
    const programData = programs[program]
    if (programData) {
      // Try command-specific renderer first
      const renderer =
        programData.renderers[commandId] || programData.defaultRenderer
      if (renderer) {
        await Promise.resolve(renderer(services, output, session))
      }
    }

    return output
  }
}

/**
 * Plucks only the data that the function expects based on its schema
 */
function pluckCLIData(
  mergedData: Record<string, any>,
  schema: any,
  availableOptions: Record<string, CLIOption>
): Record<string, any> {
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
  createSessionServices?: (session: CoreUserSession) => Promise<any>
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

  // Get function config and metadata
  const funcConfig = pikkuState('function', 'functions').get(funcName)
  if (!funcConfig) {
    throw new NotFoundError(`Function not found: ${funcName}`)
  }

  // Pass the full CLI data structure to the wrapper function
  // The wrapper will handle plucking the correct data and validation
  const processedData = {
    program,
    commandPath,
    data,
  }

  // Get program-specific middleware
  const programs: Record<string, CLIProgramState> =
    pikkuState('cli', 'programs') || {}
  const programData = programs[program]
  const globalMiddleware = programData?.globalMiddleware || []

  // Get command-specific middleware (if stored)
  const commandMiddleware = [] // TODO: Add support for command-specific middleware

  // Combine middleware
  const middleware = combineMiddleware(PikkuWiringTypes.cli, funcName, {
    wiringMiddleware: globalMiddleware,
    funcMiddleware: commandMiddleware,
  })

  let sessionServices: SessionServices | undefined
  let output: any

  // Main execution logic wrapped for middleware handling
  const runMain = async () => {
    const session: CoreUserSession | undefined = undefined

    if (!session && funcConfig.auth !== false) {
      throw new Error('Authentication required')
    }

    // Create session services if needed
    if (session && createSessionServices) {
      sessionServices = await createSessionServices(session)
    }

    // Merge services after session creation
    const allServices = { ...singletonServices, ...sessionServices }

    // Execute the wrapped function directly (it handles plucking and rendering)
    output = await funcConfig.func(allServices, processedData, session)
  }

  try {
    // Run middleware, then execute main logic
    await runMiddleware(
      singletonServices,
      {
        cli: {
          program,
          command: commandPath,
          data,
        },
      },
      middleware,
      runMain
    )

    return output
  } finally {
    // Clean up session services
    if (sessionServices) {
      await closeSessionServices(singletonServices.logger, sessionServices)
    }
  }
}

/**
 * Helper to add CLI-specific middleware
 */
export const addCLIMiddleware = <PikkuMiddleware extends CorePikkuMiddleware>(
  program: string,
  commandPath: string | string[],
  middleware: PikkuMiddleware[]
) => {
  const programs: Record<string, CLIProgramState> =
    pikkuState('cli', 'programs') || {}

  if (!programs[program]) {
    programs[program] = {
      defaultRenderer: undefined,
      globalMiddleware: [],
      renderers: {},
    }
  }

  if (Array.isArray(commandPath)) {
    // Global program middleware
    programs[program].globalMiddleware = [
      ...programs[program].globalMiddleware,
      ...middleware,
    ]
  } else {
    // Command-specific middleware (TODO: implement command-specific middleware storage)
    console.warn('Command-specific middleware not yet implemented')
  }

  pikkuState('cli', 'programs', programs)
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
