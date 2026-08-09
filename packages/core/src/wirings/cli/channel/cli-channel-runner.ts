import { pikkuState } from '../../../pikku-state.js'
import type { CorePikkuCLIRender, CLIMeta } from '../cli.types.js'
import { generateCommandHelp, parseCLIArguments } from '../command-parser.js'

// knowledge: decisions/internals/cli-stdout-is-reserved-for-machine-readable-output.md
const defaultJSONRenderer: CorePikkuCLIRender<any> = (_services, data) => {
  console.log(JSON.stringify(data))
}

export async function executeCLIViaChannel({
  programName,
  pikkuWS,
  args = process.argv.slice(2),
  renderers = {},
  defaultRenderer,
}: {
  programName: string
  pikkuWS: any // a CorePikkuWebsocket
  args?: string[]
  renderers?: Record<string, CorePikkuCLIRender<any>>
  defaultRenderer?: CorePikkuCLIRender<any>
}): Promise<void> {
  const cliMeta = pikkuState(null, 'cli', 'meta')
  if (!cliMeta || !('programs' in cliMeta)) {
    throw new Error(
      '[PKU342] CLI metadata not found. No CLI wirings were registered. See https://pikku.dev/docs/pikku-cli/errors/pku342 for more information.'
    )
  }
  const allCLIMeta = cliMeta as CLIMeta
  const programMeta = allCLIMeta.programs[programName]

  if (!programMeta) {
    console.error(`Error: CLI program "${programName}" not found`)
    process.exit(1)
  }

  const parsed = parseCLIArguments(args, programName, allCLIMeta)

  // Parsed first so that `<command> --help` resolves to that command's help.
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
    // knowledge: decisions/internals/cli-parse-errors-are-routed-by-message-prefix.md
    const hasUnknownCommand = parsed.errors.some(
      (error) =>
        error.startsWith('Unknown command:') ||
        error.startsWith('Command not found:')
    )

    if (hasUnknownCommand) {
      const helpText = generateCommandHelp(
        programName,
        allCLIMeta,
        parsed.commandPath
      )
      console.log(helpText)
      process.exit(1)
    } else {
      console.error('Errors:')
      parsed.errors.forEach((error) => console.error(`  ${error}`))
      process.exit(1)
    }
  }

  const data = { ...parsed.positionals, ...parsed.options }

  const commandId = parsed.commandPath.join('.')
  const renderer =
    renderers[commandId] || defaultRenderer || defaultJSONRenderer

  return new Promise((resolve, reject) => {
    const commandRoute = pikkuWS.getRoute('command')

    const responseHandler = (response: any) => {
      if (
        response?.action === 'cli-control' &&
        response?.event === 'complete'
      ) {
        commandRoute.unsubscribe(commandId, responseHandler)
        pikkuWS.ws.close()
        resolve(undefined)
        return
      }

      // A CLI channel response is rendered off-process: there are no services
      // to hand the renderer, and every CLI renderer ignores the argument.
      renderer(null as never, response, undefined)
    }

    commandRoute.subscribe(commandId, responseHandler)

    pikkuWS.ws.addEventListener('close', () => {
      commandRoute.unsubscribe(commandId, responseHandler)
      resolve(undefined)
    })

    pikkuWS.ws.addEventListener('error', (error: any) => {
      commandRoute.unsubscribe(commandId, responseHandler)
      reject(error)
    })

    if (pikkuWS.ws.readyState === 1) {
      commandRoute.send(commandId, data)
    } else {
      pikkuWS.ws.addEventListener('open', () => {
        commandRoute.send(commandId, data)
      })
    }
  })
}
