import { pikkuState } from '../../../pikku-state.js'
import type { CLIMeta } from '../cli.types.js'
import { parseCLIArguments, generateCommandHelp } from '../command-parser.js'
import { runCLICommand } from '../cli-runner.js'
import type { CoreSingletonServices, CreateWireServices } from '../../../types/core.types.js'

/**
 * Handles raw CLI input from a WebSocket channel.
 * Parses the args, resolves the command, and either returns help or executes it.
 */
export async function handleRawCLI({
  programName,
  args,
  singletonServices,
  createWireServices,
}: {
  programName: string
  args: string[]
  singletonServices: CoreSingletonServices
  createWireServices?: CreateWireServices
}): Promise<{ help?: string; result?: unknown; error?: string }> {
  const allCLIMeta = pikkuState(null, 'cli', 'meta') as CLIMeta | undefined
  if (!allCLIMeta) {
    return { error: 'CLI metadata not found' }
  }

  const programMeta = allCLIMeta.programs[programName]
  if (!programMeta) {
    return { error: `Program "${programName}" not found` }
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
    return { help: helpText }
  }

  // Parse the args
  const parsed = parseCLIArguments(args, programName, allCLIMeta)

  // If there are errors or the command resolves to a group (no function), show help
  if (parsed.errors.length > 0 || parsed.commandPath.length === 0) {
    const helpText = generateCommandHelp(
      programName,
      allCLIMeta,
      parsed.commandPath
    )
    return { help: helpText }
  }

  // Check if the resolved command has a pikkuFuncId (is executable)
  let current: { pikkuFuncId?: string; subcommands?: Record<string, any> } | undefined = programMeta.commands[parsed.commandPath[0]]
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
    return { help: helpText }
  }

  // Execute the command
  const data = { ...parsed.positionals, ...parsed.options }

  try {
    const result = await runCLICommand({
      program: programName,
      commandPath: parsed.commandPath,
      data,
      singletonServices,
      createWireServices,
    })
    return { result }
  } catch (e: unknown) {
    return { error: (e as Error).message }
  }
}
