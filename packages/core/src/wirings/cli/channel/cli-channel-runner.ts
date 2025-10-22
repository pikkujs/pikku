import { pikkuState } from '../../../pikku-state.js'
import { CorePikkuCLIRender, CLIMeta } from '../cli.types.js'
import { generateCommandHelp, parseCLIArguments } from '../command-parser.js'

/**
 * Default JSON renderer for CLI output
 */
const defaultJSONRenderer: CorePikkuCLIRender<any> = (_services, data) => {
  console.log(JSON.stringify(data, null, 2))
}

/**
 * Execute a CLI program via WebSocket channel
 * This is the main entry point for CLI-over-Channel clients
 */
export async function executeCLIViaChannel({
  programName,
  pikkuWS,
  args = process.argv.slice(2),
  renderers = {},
  defaultRenderer,
}: {
  programName: string
  pikkuWS: any // CorePikkuWebsocket instance
  args?: string[]
  renderers?: Record<string, CorePikkuCLIRender<any>>
  defaultRenderer?: CorePikkuCLIRender<any>
}): Promise<void> {
  // Get CLI metadata from state
  const allCLIMeta = pikkuState('cli', 'meta') as unknown as CLIMeta | undefined
  if (!allCLIMeta) {
    throw new Error(
      '[PKU342] CLI metadata not found. No CLI wirings were registered. See https://pikku.dev/docs/errors/pku342 for more information.'
    )
  }
  const programMeta = allCLIMeta.programs[programName]

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

  // Get the renderer for this command
  const commandId = parsed.commandPath.join('.')
  const renderer =
    renderers[commandId] || defaultRenderer || defaultJSONRenderer

  return new Promise((resolve, reject) => {
    // Subscribe to responses for this command
    const commandRoute = pikkuWS.getRoute('command')

    const responseHandler = (response: any) => {
      // Call renderer for any output
      renderer(null as any, response, undefined)
    }

    commandRoute.subscribe(commandId, responseHandler)

    // Handle connection close
    pikkuWS.ws.addEventListener('close', () => {
      commandRoute.unsubscribe(commandId, responseHandler)
      resolve(undefined)
    })

    pikkuWS.ws.addEventListener('error', (error: any) => {
      commandRoute.unsubscribe(commandId, responseHandler)
      reject(error)
    })

    // Send the command once connected
    if (pikkuWS.ws.readyState === 1) {
      // Already open
      commandRoute.send(commandId, data)
    } else {
      // Wait for open
      pikkuWS.ws.addEventListener('open', () => {
        commandRoute.send(commandId, data)
      })
    }
  })
}
