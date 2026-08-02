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
 * Handles raw CLI input from a WebSocket channel.
 *
 * The client sends argv untouched and this side owns parsing, so the command
 * tree lives with the server and a client binary never needs to know it. Pass
 * `onOutput` to stream progressive output back rather than rendering it into
 * the server's own stdout.
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
  /**
   * The session the connection authenticated as during its upgrade. Commands
   * run as that user, which is what makes an authenticated command reachable
   * from a client that owns no commands of its own.
   */
  session?: CoreUserSession
  onOutput?: (data: unknown, commandId: string) => Promise<void> | void
  /**
   * The channel the command arrived on. Passed through so `channel.remote(...)`
   * inside a command reaches the calling client rather than being refused as a
   * one-way stream.
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

  // Handle empty input or explicit help
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

  // Parse the args
  const parsed = parseCLIArguments(args, programName, allCLIMeta)

  // If there are errors or the command resolves to a group (no function), show
  // help — but an unparseable invocation is still a failure, so it exits 1.
  if (parsed.errors.length > 0 || parsed.commandPath.length === 0) {
    const helpText = generateCommandHelp(
      programName,
      allCLIMeta,
      parsed.commandPath
    )
    // Help alone tells the user what is available, not what they got wrong.
    // The parser knows ("Unknown command: x"), so it is carried alongside.
    return {
      help: helpText,
      error: parsed.errors.length > 0 ? parsed.errors.join('\n') : undefined,
      exitCode: 1,
    }
  }

  // Check if the resolved command has a pikkuFuncId (is executable)
  let current:
    | { pikkuFuncId?: string; subcommands?: Record<string, any> }
    | undefined = programMeta.commands[parsed.commandPath[0]]
  for (let i = 1; i < parsed.commandPath.length; i++) {
    current = current?.subcommands?.[parsed.commandPath[i]]
  }
  if (!current?.pikkuFuncId) {
    // It's a group command — show help scoped to that group
    const helpText = generateCommandHelp(
      programName,
      allCLIMeta,
      parsed.commandPath
    )
    return { help: helpText, exitCode: 0 }
  }

  // Execute the command
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
      // The caller can't know the resolved command until parsing finishes
      // here, so it's supplied per-frame rather than up front.
      onOutput: onOutput && ((data) => onOutput(data, commandId)),
      transport,
    })
    return { result, exitCode: 0, commandId }
  } catch (e: unknown) {
    // A command can throw anything. Reading `.message` off a string or an
    // undefined gives undefined, and the client only prints an error frame it
    // was actually sent — so the run would exit 1 saying nothing at all.
    const message = e instanceof Error ? e.message : String(e)
    return { error: message || 'Command failed', exitCode: 1, commandId }
  }
}
