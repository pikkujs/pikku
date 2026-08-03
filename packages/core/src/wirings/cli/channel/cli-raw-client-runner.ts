import {
  createChannelRPCResponder,
  isChannelRPCRequest,
} from '../../channel/channel-rpc.js'
import type {
  ApprovalRequester,
  Capabilities,
} from '../../channel/channel-rpc.js'
import { approverForMode, takeApprovalFlags } from './cli-approval.js'
import type { CorePikkuCLIRender } from '../cli.types.js'

/** The normal case once the server owns the command tree. */
const defaultJSONRenderer: CorePikkuCLIRender<any> = (_services, data) => {
  console.log(JSON.stringify(data))
}

/**
 * The command ran on the server, so there are no services here — but a renderer
 * written for local execution can still reach for `services.logger`.
 */
const clientServices = { logger: console } as any

/**
 * Runs a CLI command entirely on the server. Unlike `executeCLIViaChannel`,
 * argv is forwarded untouched and never parsed here, so the client carries no
 * command metadata and its version may drift from the server's.
 *
 * `capabilities` are the functions this client agrees to run on the server's
 * behalf: the map says what *can* run, and approval whether a call *should*.
 * `approve` overrides the mode otherwise read from argv and from whether there
 * is a terminal to ask at.
 */
export async function executeRawCLIViaChannel({
  pikkuWS,
  args = process.argv.slice(2),
  renderers = {},
  defaultRenderer,
  capabilities = {},
  approve,
}: {
  pikkuWS: any // CorePikkuWebsocket instance
  args?: string[]
  // `any` for the services parameter rather than the default `CoreServices`:
  // the renderers handed in are the app's own, typed against its
  // `SingletonServices`, and a function taking those is not assignable to one
  // taking `CoreServices`. Nothing is lost by widening — a client-side renderer
  // is never called with services at all, which is why generation rejects one
  // that reads them.
  renderers?: Record<string, CorePikkuCLIRender<any, any>>
  defaultRenderer?: CorePikkuCLIRender<any, any>
  capabilities?: Capabilities
  approve?: ApprovalRequester
}): Promise<number> {
  // Stripped before argv goes to the server: a flag the server can see is one
  // the server could act on.
  const { mode, args: commandArgs } = takeApprovalFlags(args)
  // Aborted when the run ends, so a prompt still on stdin stops holding the
  // event loop open.
  const runEnded = new AbortController()
  const approver = approve ?? approverForMode(mode, { signal: runEnded.signal })

  const render = (commandId: string | undefined, data: unknown) => {
    const renderer =
      (commandId ? renderers[commandId] : undefined) ||
      defaultRenderer ||
      defaultJSONRenderer
    renderer(clientServices, data, undefined)
  }

  return new Promise<number>((resolve) => {
    const commandRoute = pikkuWS.getRoute('command')

    let settled = false

    // Plain frames, not a command route: the server takes these off the socket
    // before routing.
    const respond = createChannelRPCResponder({
      capabilities,
      approve: approver,
      send: (data) => {
        // A capability can still be resolving when the run settles. `respond`
        // is dispatched without a handler, so a throw here would surface as an
        // unhandled rejection — and by then the answer is moot.
        if (settled || pikkuWS.ws.readyState !== 1) {
          return
        }
        pikkuWS.ws.send(JSON.stringify(data))
      },
    })

    const finish = (code: number) => {
      if (settled) {
        return
      }
      settled = true
      runEnded.abort()
      pikkuWS.unsubscribe(handler)
      try {
        pikkuWS.ws.close()
      } catch {
        // Already closing — the exit code is what matters.
      }
      resolve(code)
    }

    // Every frame, not a command id: the server owns the command tree, and
    // progressive `channel.send` frames carry no routing key at all.
    const handler = (message: any) => {
      // Classified synchronously so a request never also reaches the renderer.
      // Answering is deliberately not awaited, so a slow capability cannot
      // stall the output stream behind it.
      if (isChannelRPCRequest(message)) {
        void respond(message)
        return
      }

      // Only declared shapes: the channel also carries the runtime's routing
      // echo, and rendering that would print noise between real output.
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

    // Only the server's `complete` frame reports success: a socket that closes
    // before one means the command did not finish.
    pikkuWS.ws.addEventListener('close', () => finish(1))
    // A transport failure exits like a failed command rather than rejecting —
    // to a CLI user both are simply a run that did not work.
    pikkuWS.ws.addEventListener('error', (error: any) => {
      if (!settled) {
        console.error(error?.message ?? String(error))
        finish(1)
      }
    })

    const sendCommand = () => commandRoute.send('__raw', { args: commandArgs })
    if (pikkuWS.ws.readyState === 1) {
      sendCommand()
    } else {
      pikkuWS.ws.addEventListener('open', sendCommand)
    }
  })
}
