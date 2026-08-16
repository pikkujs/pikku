import { NotFoundError } from '../../errors/errors.js'
import { isExpectedError } from '../../errors/error-handler.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { pikkuState } from '../../pikku-state.js'
import type { CoreUserSession } from '../../types/core.types.js'
import type { CorePikkuMiddleware } from '../../middleware/middleware.types.js'
import type {
  CoreCLI,
  CLICommandMeta,
  CLIOption,
  CLIProgramState,
  CorePikkuCLIRender,
  CoreCLICommandConfig,
  CLIMeta,
} from './cli.types.js'
import type {
  CoreConfig,
  CoreSingletonServices,
  CoreServices,
  CreateWireServices,
  PikkuRawWire,
  CreateConfig,
  CreateSingletonServices,
} from '../../types/core.types.js'
import type { PikkuChannel } from '../channel/channel.types.js'
import { unsupportedChannelRemote } from '../channel/channel-rpc.types.js'
import {
  PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../../services/user-session-service.js'
import { LocalVariablesService } from '../../services/local-variables.js'
import { generateCommandHelp, parseCLIArguments } from './command-parser.js'

/** The caller is expected to catch this and call `process.exit(exitCode)`. */
export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: number = 1
  ) {
    super(message)
    this.name = 'CLIError'
  }
}

// knowledge: decisions/internals/cli-stdout-is-reserved-for-machine-readable-output.md
const defaultJSONRenderer: CorePikkuCLIRender<any> = (_services, data) => {
  console.log(JSON.stringify(data))
}

export const wireCLI = <
  Commands extends Record<string, CoreCLICommandConfig<any, any, any>>,
  GlobalOptions,
  PikkuMiddleware extends CorePikkuMiddleware,
  GlobalOutput,
>(
  cli: CoreCLI<Commands, GlobalOptions, PikkuMiddleware, GlobalOutput>
) => {
  const cliMeta = pikkuState(null, 'cli', 'meta') || {}

  if (!cliMeta.programs?.[cli.program]) {
    console.warn(
      `[pikku] Skipping CLI program '${cli.program}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }

  const programs: Record<string, CLIProgramState> =
    pikkuState(null, 'cli', 'programs') || {}
  programs[cli.program] = {
    defaultRenderer: (cli.render ||
      defaultJSONRenderer) as CorePikkuCLIRender<any>,
    middleware: cli.middleware || [],
    renderers: {},
    tags: cli.tags,
  }
  pikkuState(null, 'cli', 'programs', programs)

  registerCLICommands(
    cli.commands as Record<string, any>,
    [],
    cli.options || {},
    cli.program
  )
}

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

  return command
}

function registerCLICommands(
  commands: Record<string, any>,
  path: string[] = [],
  inheritedOptions: Record<string, CLIOption> = {},
  program: string
) {
  const cliMeta = pikkuState(null, 'cli', 'meta').programs[program]

  for (const [name, command] of Object.entries(commands)) {
    const fullPath = [...path, name]
    const commandId = fullPath.join('.')

    let currentMeta: CLICommandMeta | undefined = cliMeta?.commands[fullPath[0]]
    for (let i = 1; i < fullPath.length; i++) {
      currentMeta = currentMeta?.subcommands?.[fullPath[i]]
    }
    const funcName = currentMeta?.pikkuFuncId

    // A command group has no function of its own.
    if (!funcName) {
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

    const commandOptions =
      typeof command === 'object' ? command.options || {} : {}
    const mergedOptions = { ...inheritedOptions, ...commandOptions }

    const programs: Record<string, CLIProgramState> = pikkuState(
      null,
      'cli',
      'programs'
    )
    if (programs[program]) {
      if (!programs[program].commandOptions) {
        programs[program].commandOptions = {}
      }
      programs[program].commandOptions![commandId] = mergedOptions

      if (typeof command === 'object' && command.middleware) {
        if (!programs[program].commandMiddleware) {
          programs[program].commandMiddleware = {}
        }
        programs[program].commandMiddleware![commandId] = command.middleware
      }
    }

    // Merge the command-level auth/permissions into the registered config so
    // they are actually enforced by the function runner. They were accepted by
    // the types but dropped here, making a command's declared access control a
    // silent no-op. Command-level wins over the handler's own, then falls back
    // to it.
    const unwrapped = unwrapFunc(command)
    const commandAuth = typeof command === 'object' ? command.auth : undefined
    const commandPermissions =
      typeof command === 'object' ? command.permissions : undefined
    addFunction(
      funcName,
      {
        ...unwrapped,
        auth: commandAuth ?? unwrapped.auth,
        permissions: commandPermissions ?? unwrapped.permissions,
      },
      currentMeta?.packageName
    )

    if (typeof command === 'object' && command.render) {
      if (programs[program]) {
        programs[program].renderers[commandId] = command.render
      }
    }

    if (typeof command === 'object' && command.subcommands) {
      registerCLICommands(command.subcommands, fullPath, mergedOptions, program)
    }
  }
}

function pluckCLIData(
  mergedData: Record<string, any>,
  funcName: string,
  availableOptions: Record<string, CLIOption>
): Record<string, any> {
  const funcMeta = pikkuState(null, 'function', 'meta')[funcName]
  const schemaName = funcMeta?.inputSchemaName
  const schema = schemaName
    ? pikkuState(funcMeta?.packageName ?? null, 'misc', 'schemas').get(
        schemaName
      )
    : null

  if (schema && schema.properties) {
    const result: Record<string, any> = {}
    for (const key of Object.keys(schema.properties)) {
      if (key in mergedData) {
        // CLI values always arrive as strings; split comma lists the schema wants as arrays.
        let value = mergedData[key]
        const propSchema = schema.properties[key]
        if (propSchema?.type === 'array' && !Array.isArray(value)) {
          value = typeof value === 'string' ? value.split(',') : [value]
        }
        result[key] = value
      } else if (availableOptions[key]?.default !== undefined) {
        result[key] = availableOptions[key].default
      }
    }
    return result
  } else {
    return { ...mergedData }
  }
}

export async function runCLICommand({
  program,
  commandPath,
  data,
  singletonServices,
  createWireServices,
  onOutput,
  session,
  transport,
}: {
  program: string
  commandPath: string[]
  data: Record<string, any>
  singletonServices: CoreSingletonServices
  createWireServices?: CreateWireServices
  /**
   * A locally run CLI has none — the process is the user. Over a channel the
   * command inherits what the connection authenticated as, or no authenticated
   * command is reachable remotely.
   */
  session?: CoreUserSession
  /**
   * Diverts everything the command emits to a sink instead of the local
   * renderer: when running on behalf of a remote CLI, rendering here would
   * print to the *server's* stdout.
   */
  onOutput?: (data: unknown) => Promise<void> | void
  /**
   * The connection the command arrived on. The CLI wire's own channel is
   * synthetic, so reaching the caller is delegated to the real one underneath.
   */
  transport?: PikkuChannel<unknown, any, any>
}): Promise<any> {
  const cliMeta = pikkuState(null, 'cli', 'meta')
  const programMeta = cliMeta.programs?.[program]
  if (!programMeta) {
    throw new NotFoundError(`Program not found: ${program}`)
  }

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

  const funcName = currentCommand.pikkuFuncId

  const programs: Record<string, CLIProgramState> =
    pikkuState(null, 'cli', 'programs') || {}
  const programData = programs[program]

  const allWireMiddleware: CorePikkuMiddleware[] = [
    ...(programData?.middleware || []),
  ]

  const commandParts: string[] = []
  for (const part of commandPath) {
    commandParts.push(part)
    const commandId = commandParts.join('.')
    const middleware = programData?.commandMiddleware?.[commandId]
    if (middleware) {
      allWireMiddleware.push(...middleware)
    }
  }

  const commandId = commandPath.join('.')
  const availableOptions = programData?.commandOptions?.[commandId] || {}

  const pluckedData = () => pluckCLIData(data, funcName, availableOptions)

  const renderer =
    programData?.renderers[commandId] || programData?.defaultRenderer

  let cliState: unknown
  const channel: PikkuChannel<unknown, unknown> = {
    channelId: `cli:${program}:${commandId}`,
    openingData: pluckedData,
    send: async (data: any) => {
      if (onOutput) {
        await onOutput(data)
      } else if (renderer) {
        await Promise.resolve(renderer(singletonServices, data, undefined))
      }
    },
    sendBinary: () => {
      throw new Error('Binary data is not supported on CLI channels')
    },
    close: () => {
      if (channel) {
        channel.state = 'closed'
      }
    },
    state: 'open',
    setState: (s) => {
      cliState = s
    },
    // knowledge: decisions/internals/channel-state-accessors-are-unsound-generics-that-every-implementation-asserts.md
    getState: () => cliState as never,
    clearState: () => {
      cliState = undefined
    },
    // A locally-run command is already on the machine it would call back to,
    // so there is no peer to answer.
    remote: transport
      ? (funcName: string, data?: unknown) => transport.remote(funcName, data)
      : unsupportedChannelRemote,
  }

  const userSession = new PikkuSessionService<CoreUserSession>(
    singletonServices.sessionStore
  )
  if (session) {
    userSession.setInitial(session)
  }

  const wire: PikkuRawWire = {
    cli: {
      program,
      command: commandPath,
      data: pluckedData,
      channel,
    },
    ...createMiddlewareSessionWireProps(userSession),
  }

  try {
    const result = await runPikkuFunc('cli', commandId, funcName, {
      singletonServices,
      createWireServices,
      data: pluckedData,
      auth: false,
      inheritedMiddleware: currentCommand.middleware,
      wireMiddleware: allWireMiddleware,
      coerceDataFromSchema: true,
      tags: programData?.tags,
      wire,
      sessionService: userSession,
      packageName: currentCommand.packageName,
    })

    // knowledge: decisions/internals/cli-stdout-is-reserved-for-machine-readable-output.md
    // A void function has already emitted its own output.
    //
    // `onOutput` is progressive output only — the result goes back to the
    // caller, and emitting it here too would deliver it twice.
    if (result !== undefined && !onOutput) {
      const commandRenderer = programData?.renderers[commandId]
      const jsonMode =
        (data as { json?: unknown; output?: unknown }).json === true ||
        (data as { json?: unknown; output?: unknown }).output === 'json'
      const finalRenderer: CorePikkuCLIRender<any> | undefined =
        jsonMode && commandRenderer !== undefined
          ? defaultJSONRenderer
          : (commandRenderer ?? programData?.defaultRenderer)
      if (finalRenderer !== undefined) {
        await Promise.resolve(
          finalRenderer(
            singletonServices,
            result,
            userSession.get() as CoreUserSession | undefined
          )
        )
      }
    }

    return result
  } finally {
    channel.close()
  }
}

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

export async function executeCLI({
  programName,
  args,
  createConfig,
  createSingletonServices,
  createWireServices,
}: {
  programName: string
  args?: string[]
  createConfig?: CreateConfig<any, any>
  createSingletonServices: CreateSingletonServices<any, any>
  createWireServices?: CreateWireServices<any, any, any>
}): Promise<void> {
  if (!args) {
    throw new Error(
      'CLI arguments are required, this is to satisfy release diffs'
    )
  }

  try {
    const allCLIMeta = pikkuState(null, 'cli', 'meta') as unknown as
      CLIMeta | undefined
    if (!allCLIMeta) {
      throw new Error(
        '[PKU342] CLI metadata not found. No CLI wirings were registered. See https://pikku.dev/docs/pikku-cli/errors/pku342 for more information.'
      )
    }
    const programMeta = allCLIMeta.programs[programName]

    if (!programMeta) {
      throw new CLIError(`CLI program "${programName}" not found`, 1)
    }

    const parsed = parseCLIArguments(args, programName, allCLIMeta)

    // Parsed first so that `<command> --help` resolves to that command's help.
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

    // knowledge: decisions/internals/cli-stdout-is-reserved-for-machine-readable-output.md
    parsed.warnings.forEach((warning) => console.error(`Warning: ${warning}`))

    if (parsed.errors.length > 0) {
      // knowledge: decisions/internals/cli-parse-errors-are-routed-by-message-prefix.md
      const hasUnknownCommand = parsed.errors.some(
        (error) =>
          error.startsWith('Unknown command:') ||
          error.startsWith('Command not found:') ||
          error.startsWith('Missing subcommand:')
      )

      if (hasUnknownCommand) {
        const helpText = generateCommandHelp(
          programName,
          allCLIMeta,
          parsed.commandPath
        )
        console.log(helpText)
        throw new CLIError('Unknown command', 1)
      } else {
        console.error('Errors:')
        parsed.errors.forEach((error) => console.error(`  ${error}`))
        throw new CLIError(parsed.errors.join('\n'), 1)
      }
    }

    const data = { ...parsed.positionals, ...parsed.options }

    const config = createConfig
      ? await createConfig(new LocalVariablesService(), data)
      : ({} as CoreConfig)

    const singletonServices = await createSingletonServices(config)
    pikkuState(null, 'package', 'singletonServices', singletonServices)

    await runCLICommand({
      program: programName,
      commandPath: parsed.commandPath,
      data,
      singletonServices,
      createWireServices,
    })
  } catch (error: any) {
    if (error instanceof CLIError) {
      throw error
    }

    // An expected PikkuError's message is written to be the whole output.
    if (isExpectedError(error)) {
      console.error(error.message)
    } else {
      console.error('Error:', error)
    }

    if (args.includes('--verbose') || args.includes('-v')) {
      console.error('Stack trace:', error.stack)
    }

    throw new CLIError(error.message || String(error), 1)
  }
}
