import { pikkuState } from '../../../pikku-state.js'
import type { CLIMeta } from '../cli.types.js'
import { parseCLIArguments, generateCommandHelp } from '../command-parser.js'
import { runCLICommand } from '../cli-runner.js'
import type {
  CoreSingletonServices,
  CoreUserSession,
  CreateWireServices,
} from '../../../types/core.types.js'
import type { PikkuChannel } from '../../channel/channel.types.js'

/**
 * A frame sent from the server to a raw CLI client. `output` carries command
 * data to render; `complete` terminates the command and carries the exit code
 * so the client process can exit non-zero on failure.
 */
export type RawCLIFrame =
  | { action: 'cli-output'; commandId?: string; data: unknown }
  | { action: 'cli-result'; commandId?: string; result: unknown }
  | { action: 'cli-help'; help: string }
  | { action: 'cli-error'; error: string }
  | { action: 'cli-control'; event: 'complete'; exitCode: number }

export interface RawCLIResult {
  help?: string
  result?: unknown
  error?: string
  /** 0 on success, 1 on any parse or execution failure. */
  exitCode: number
  /** The command the server resolved, so a client can pick a renderer. */
  commandId?: string
}

/**
 * The client sends argv untouched and this side owns parsing, so the command
 * tree lives with the server and a client binary never needs to know it.
 */
export async function handleRawCLI({
  programName,
  args,
  singletonServices,
  createWireServices,
  onOutput,
  session,
  transport,
}: {
  programName: string
  args: string[]
  singletonServices: CoreSingletonServices
  createWireServices?: CreateWireServices
  /** Established during the upgrade; commands run as that user. */
  session?: CoreUserSession
  onOutput?: (data: unknown, commandId: string) => Promise<void> | void
  /**
   * The channel the command arrived on, so `channel.remote(...)` reaches the
   * calling client rather than being refused as a one-way stream.
   */
  transport?: PikkuChannel<unknown, any, any>
}): Promise<RawCLIResult> {
  const allCLIMeta = pikkuState(null, 'cli', 'meta') as CLIMeta | undefined
  if (!allCLIMeta) {
    return { error: 'CLI metadata not found', exitCode: 1 }
  }

  const programMeta = allCLIMeta.programs[programName]
  if (!programMeta) {
    return { error: `Program "${programName}" not found`, exitCode: 1 }
  }

  if (
    args.length === 0 ||
    args.includes('--help') ||
    args.includes('-h') ||
    args[0] === 'help'
  ) {
    const helpArgs = args.filter(
      (a) => a !== 'help' && a !== '--help' && a !== '-h'
    )
    const helpText = generateCommandHelp(programName, allCLIMeta, helpArgs)
    return { help: helpText, exitCode: 0 }
  }

  const parsed = parseCLIArguments(args, programName, allCLIMeta)

  if (parsed.errors.length > 0 || parsed.commandPath.length === 0) {
    const helpText = generateCommandHelp(
      programName,
      allCLIMeta,
      parsed.commandPath
    )
    // Help says what is available, not what they got wrong — so the parser's
    // reason rides alongside it.
    return {
      help: helpText,
      error: parsed.errors.length > 0 ? parsed.errors.join('\n') : undefined,
      exitCode: 1,
    }
  }

  let current:
    | { pikkuFuncId?: string; subcommands?: Record<string, any> }
    | undefined = programMeta.commands[parsed.commandPath[0]]
  for (let i = 1; i < parsed.commandPath.length; i++) {
    current = current?.subcommands?.[parsed.commandPath[i]]
  }
  if (!current?.pikkuFuncId) {
    const helpText = generateCommandHelp(
      programName,
      allCLIMeta,
      parsed.commandPath
    )
    return { help: helpText, exitCode: 0 }
  }

  const data = { ...parsed.positionals, ...parsed.options }
  const commandId = parsed.commandPath.join('.')

  try {
    const result = await runCLICommand({
      program: programName,
      commandPath: parsed.commandPath,
      data,
      singletonServices,
      createWireServices,
      session,
      // Not known until parsing finishes here, so it is supplied per-frame.
      onOutput: onOutput && ((data) => onOutput(data, commandId)),
      transport,
    })
    return { result, exitCode: 0, commandId }
  } catch (e: unknown) {
    // A command can throw anything; `.message` off a string is undefined, and
    // the run would then exit 1 saying nothing at all.
    const message = e instanceof Error ? e.message : String(e)
    return { error: message || 'Command failed', exitCode: 1, commandId }
  }
}
