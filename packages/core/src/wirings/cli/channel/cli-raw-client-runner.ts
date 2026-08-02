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

/**
 * Default renderer for output whose command the client doesn't recognise —
 * which is the normal case once the server owns the command tree. NDJSON keeps
 * it machine-parseable.
 */
const defaultJSONRenderer: CorePikkuCLIRender<any> = (_services, data) => {
  console.log(JSON.stringify(data))
}

/**
 * There are no services on this side — the command ran on the server. A
 * renderer written for local execution can still reach for `services.logger`,
 * so it gets a console-backed stub rather than a `null` that turns a rendering
 * call into a `TypeError`.
 */
const clientServices = { logger: console } as any

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
 * reachable, and anything in it that is not explicitly classified
 * `needsApproval: false` is put to the user before it runs — the map says what
 * *can* run, and approval says whether this particular call *should*.
 *
 * `approve` overrides that entirely; by default the mode is read from argv
 * (`--auto-approve`, `--dangerously-auto-approve`) and whether there is a
 * terminal to ask at.
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
  renderers?: Record<string, CorePikkuCLIRender<any>>
  defaultRenderer?: CorePikkuCLIRender<any>
  capabilities?: Capabilities
  approve?: ApprovalRequester
}): Promise<number> {
  // Stripped before argv goes to the server: the decision of what may run on
  // this machine belongs to this machine, and a flag the server can see is a
  // flag the server could act on.
  const { mode, args: commandArgs } = takeApprovalFlags(args)
  // Aborted when the run ends, so a prompt still waiting on stdin stops
  // holding the event loop open after there is nothing left to approve.
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

    // Answers go back as plain frames rather than on a command route: the
    // server takes them off the socket before routing, so replying does not
    // depend on the channel having declared a route for them.
    const respond = createChannelRPCResponder({
      capabilities,
      approve: approver,
      send: (data) => {
        // A capability can still be resolving when the run settles and the
        // socket closes. `respond` is dispatched without a handler, so a throw
        // from `send` here would surface as an unhandled rejection rather than
        // as anything the run could act on — by then the answer is moot.
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

    const sendCommand = () => commandRoute.send('__raw', { args: commandArgs })
    if (pikkuWS.ws.readyState === 1) {
      sendCommand()
    } else {
      pikkuWS.ws.addEventListener('open', sendCommand)
    }
  })
}
