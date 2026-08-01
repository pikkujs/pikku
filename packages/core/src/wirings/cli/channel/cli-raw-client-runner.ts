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

  return new Promise<number>((resolve) => {
    const commandRoute = pikkuWS.getRoute('command')

    // Answers go back as plain frames rather than on a command route: the
    // server takes them off the socket before routing, so replying does not
    // depend on the channel having declared a route for them.
    const respond = createChannelRPCResponder({
      capabilities,
      send: (data) => pikkuWS.ws.send(JSON.stringify(data)),
    })

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

      // Only the declared frame shapes are acted on. The channel also carries
      // the runtime's own routing echo and anything else sharing the socket;
      // rendering those would print noise between a command's real output.
      switch (message?.action) {
        case 'cli-output':
          render(message.commandId, message.data)
          break
        case 'cli-result':
          render(message.commandId, message.result)
          break
        case 'cli-help':
          console.log(message.help)
          break
        case 'cli-error':
          console.error(message.error)
          break
        case 'cli-control':
          if (message.event === 'complete') {
            finish(message.exitCode ?? 0)
          }
          break
      }
    }

    pikkuWS.subscribe(handler)

    // Only the server's `complete` frame reports success. A socket that closes
    // before one — rejected upgrade, connection dropped mid-command — means
    // the command did not finish, and reporting 0 there would let a caller
    // treat a connection failure as a successful run.
    pikkuWS.ws.addEventListener('close', () => finish(1))
    // A transport failure is reported the same way a failed command is: on
    // stderr, with a non-zero exit code. Rejecting instead would make every
    // caller handle "the connection broke" separately from "the command
    // failed", when to a CLI user both are simply a run that did not work.
    pikkuWS.ws.addEventListener('error', (error: any) => {
      if (!settled) {
        console.error(error?.message ?? String(error))
        finish(1)
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
