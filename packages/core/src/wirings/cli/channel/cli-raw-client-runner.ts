import {
  createChannelRPCResponder,
  isChannelRPCRequest,
} from '../../channel/channel-rpc.js'
import type { CorePikkuCLIRender } from '../cli.types.js'

/**
 * Default renderer for output whose command the client doesn't recognise —
 * which is the normal case once the server owns the command tree. NDJSON keeps
 * it machine-parseable.
 */
const defaultJSONRenderer: CorePikkuCLIRender<any> = (_services, data) => {
  console.log(JSON.stringify(data))
}

/**
 * Runs a CLI command entirely on the server.
 *
 * Unlike `executeCLIViaChannel`, argv is forwarded untouched and never parsed
 * here — the client carries no command metadata, so its version is free to
 * drift from the server's. Renderers stay local and are matched by the command
 * id the server reports; an unknown command falls back to JSON rather than
 * failing.
 *
 * `capabilities` are the functions this client agrees to run on the server's
 * behalf (reading a git sha, listing local files). Nothing outside the map is
 * reachable.
 */
export async function executeRawCLIViaChannel({
  pikkuWS,
  args = process.argv.slice(2),
  renderers = {},
  defaultRenderer,
  capabilities = {},
}: {
  pikkuWS: any // CorePikkuWebsocket instance
  args?: string[]
  renderers?: Record<string, CorePikkuCLIRender<any>>
  defaultRenderer?: CorePikkuCLIRender<any>
  capabilities?: Record<string, (data: any) => Promise<unknown> | unknown>
}): Promise<number> {
  const render = (commandId: string | undefined, data: unknown) => {
    const renderer =
      (commandId ? renderers[commandId] : undefined) ||
      defaultRenderer ||
      defaultJSONRenderer
    renderer(null as any, data, undefined)
  }

  const respond = createChannelRPCResponder({
    capabilities,
    send: (data) => pikkuWS.send(data),
  })

  return new Promise<number>((resolve, reject) => {
    const commandRoute = pikkuWS.getRoute('command')
    let exitCode = 0
    let settled = false

    const finish = (code: number) => {
      if (settled) {
        return
      }
      settled = true
      pikkuWS.unsubscribe(handler)
      try {
        pikkuWS.ws.close()
      } catch {
        // Already closing — the exit code is what matters.
      }
      resolve(code)
    }

    // Subscribes to every frame rather than to a command id: the server owns
    // the command tree, so the client cannot know which id to subscribe to,
    // and progressive `channel.send` frames carry no routing key at all.
    const handler = (message: any) => {
      // Classified synchronously so a request never also reaches the renderer;
      // answering it is async and deliberately not awaited, so a slow
      // capability can't stall the output stream behind it.
      if (isChannelRPCRequest(message)) {
        void respond(message)
        return
      }

      if (message?.action === 'cli-control' && message?.event === 'complete') {
        finish(message.exitCode ?? exitCode)
        return
      }

      if (message?.help) {
        console.log(message.help)
        exitCode = message.exitCode ?? 0
        return
      }

      if (message?.error) {
        console.error(message.error)
        exitCode = message.exitCode ?? 1
        return
      }

      if (message?.result !== undefined) {
        render(message.commandId, message.result)
        exitCode = message.exitCode ?? 0
        return
      }

      render(message?.commandId, message)
    }

    pikkuWS.subscribe(handler)

    pikkuWS.ws.addEventListener('close', () => finish(exitCode))
    pikkuWS.ws.addEventListener('error', (error: any) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    })

    const sendCommand = () => commandRoute.send('__raw', { args })
    if (pikkuWS.ws.readyState === 1) {
      sendCommand()
    } else {
      pikkuWS.ws.addEventListener('open', sendCommand)
    }
  })
}
