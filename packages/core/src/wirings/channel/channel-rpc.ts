import type { DeploymentService } from '../../services/deployment-service.js'
import type { CoreSingletonServices } from '../../types/core.types.js'
import { pikkuState } from '../../pikku-state.js'
import { validateSchema } from '../../schema.js'

/**
 * Envelope actions for request/response RPC carried over an already-open
 * channel. Both directions share one socket, so every frame is tagged and
 * correlated by `id` — a channel is otherwise fire-and-forget in both
 * directions.
 */
export const CHANNEL_RPC_REQUEST = 'pikku-rpc-request'
export const CHANNEL_RPC_RESPONSE = 'pikku-rpc-response'

export interface ChannelRPCRequest {
  action: typeof CHANNEL_RPC_REQUEST
  id: string
  funcName: string
  data: unknown
  traceId?: string
}

export interface ChannelRPCResponse {
  action: typeof CHANNEL_RPC_RESPONSE
  id: string
  ok: boolean
  result?: unknown
  error?: { name: string; message: string }
}

const isRecord = (message: unknown): message is Record<string, unknown> =>
  typeof message === 'object' && message !== null

/**
 * Both guards check the whole envelope, not just the action tag.
 *
 * Every frame arrives from the other end of a socket, so the fields the
 * correlation depends on — the id above all — are peer input. A frame tagged
 * as RPC but carrying an id of the wrong type would otherwise reach `settle`
 * and be looked up in the pending map, which is not somewhere untyped peer
 * data belongs.
 */
export const isChannelRPCRequest = (
  message: unknown
): message is ChannelRPCRequest =>
  isRecord(message) &&
  message.action === CHANNEL_RPC_REQUEST &&
  typeof message.id === 'string' &&
  message.id.length > 0 &&
  typeof message.funcName === 'string' &&
  message.funcName.length > 0 &&
  (message.traceId === undefined || typeof message.traceId === 'string')

export const isChannelRPCResponse = (
  message: unknown
): message is ChannelRPCResponse =>
  isRecord(message) &&
  message.action === CHANNEL_RPC_RESPONSE &&
  typeof message.id === 'string' &&
  message.id.length > 0 &&
  typeof message.ok === 'boolean'

/**
 * The error a caller sees when the peer is gone or never answered. Callers
 * cannot distinguish "peer rejected" from "peer vanished" without this — a
 * dropped socket must not look like a resolved call.
 */
export class ChannelRPCError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | 'timeout'
      | 'closed'
      | 'remote'
      | 'invalid'
      | 'unsupported'
  ) {
    super(message)
    this.name = 'ChannelRPCError'
  }
}

/**
 * `remote` for channels that only ever flow one way — a server-sent stream, an
 * agent's output, a local CLI writing to stdout. Nothing is listening for a
 * request on them, so the call is refused at once rather than waiting out a
 * timeout for an answer that was never going to come.
 */
export const unsupportedChannelRemote = async (
  funcName: string
): Promise<never> => {
  throw new ChannelRPCError(
    `Cannot call "${funcName}" remotely: this channel has no peer that answers`,
    'unsupported'
  )
}

/**
 * Checks what a peer returned for one capability, throwing to reject the call.
 * Async because schema validation is.
 */
export type ChannelRPCResultValidator = (
  funcName: string,
  result: unknown
) => Promise<void> | void

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

/**
 * Tracks in-flight reverse RPC calls for one channel. One registry per
 * connection: ids are only unique within a socket, and a dropped socket must
 * reject exactly the calls that were riding on it.
 */
export class ChannelRPCRegistry {
  private pending = new Map<string, PendingCall>()
  private nextId = 0
  private closed = false

  constructor(private readonly timeoutMs: number = 30_000) {}

  public get inFlight(): number {
    return this.pending.size
  }

  public register(): { id: string; promise: Promise<unknown> } {
    if (this.closed) {
      return {
        id: '',
        promise: Promise.reject(
          new ChannelRPCError('Channel is closed', 'closed')
        ),
      }
    }

    const id = `${++this.nextId}`
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer =
        this.timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id)
              reject(
                new ChannelRPCError(
                  `Channel RPC ${id} timed out after ${this.timeoutMs}ms`,
                  'timeout'
                )
              )
            }, this.timeoutMs)
          : undefined
      // Never hold the process open waiting on a peer that may not answer.
      timer?.unref?.()
      this.pending.set(id, { resolve, reject, timer })
    })

    return { id, promise }
  }

  /**
   * Settles the call a response belongs to. Returns false for an unknown id so
   * a late reply after a timeout is dropped rather than throwing.
   */
  public settle(response: ChannelRPCResponse): boolean {
    const call = this.pending.get(response.id)
    if (!call) {
      return false
    }
    this.pending.delete(response.id)
    clearTimeout(call.timer)

    if (response.ok) {
      call.resolve(response.result)
    } else {
      // The failure payload is peer input and is only read, never trusted: a
      // non-string name or message falls back rather than being attached to an
      // Error, where it would surface as `[object Object]` in a log or as
      // something other than a string to a caller matching on `error.name`.
      const { name, message } = response.error ?? {}
      const error = new ChannelRPCError(
        typeof message === 'string' ? message : 'Remote channel RPC failed',
        'remote'
      )
      if (typeof name === 'string' && name.length > 0) {
        error.name = name
      }
      call.reject(error)
    }
    return true
  }

  /**
   * Fails every in-flight call. Called when the socket drops — without this a
   * caller awaits until the timeout on a connection that is already gone.
   */
  public rejectAll(reason: string = 'Channel closed'): void {
    this.closed = true
    for (const [, call] of this.pending) {
      clearTimeout(call.timer)
      call.reject(new ChannelRPCError(reason, 'closed'))
    }
    this.pending.clear()
  }
}

/**
 * A `DeploymentService` whose transport is an open channel rather than an
 * address. This is what lets a server-side function call back into a peer that
 * has no inbound route of its own — a CLI on a laptop, a sandbox behind NAT.
 *
 * It slots into the existing `services.deploymentService` hole, so `rpc.remote`
 * resolution, session propagation and traceId plumbing are unchanged.
 */
export class ChannelDeploymentService implements DeploymentService {
  public readonly registry: ChannelRPCRegistry
  private readonly validateResult?: ChannelRPCResultValidator

  constructor(
    private readonly send: (data: unknown) => Promise<void> | void,
    options: {
      timeoutMs?: number
      validateResult?: ChannelRPCResultValidator
    } = {}
  ) {
    this.registry = new ChannelRPCRegistry(options.timeoutMs)
    this.validateResult = options.validateResult
  }

  public async init(): Promise<void> {}

  public async start(): Promise<void> {}

  public async stop(): Promise<void> {
    this.registry.rejectAll('Deployment service stopped')
  }

  /**
   * Routes a response frame read off the channel back to its caller. The
   * channel owner must call this — the service has no read side of its own.
   */
  public handleResponse(message: unknown): boolean {
    return isChannelRPCResponse(message) ? this.registry.settle(message) : false
  }

  /**
   * `session` is accepted to satisfy `DeploymentService` and deliberately not
   * sent. A deployed unit runs the call as the caller's user; the peer here is
   * a client executing a capability as itself, on its own machine, under its
   * own identity — a session on the wire would carry the caller's credentials
   * to it while authorising nothing.
   */
  public async invoke(
    funcName: string,
    data: unknown,
    _session?: unknown,
    traceId?: string
  ): Promise<unknown> {
    const { id, promise } = this.registry.register()
    // A closed registry answers with an already-rejected promise and no id.
    // Returning it before the send keeps that rejection from sitting unobserved
    // across an await, on a channel already known to be gone.
    if (!id) {
      return promise
    }

    const request: ChannelRPCRequest = {
      action: CHANNEL_RPC_REQUEST,
      id,
      funcName,
      data,
      traceId,
    }

    try {
      await this.send(request)
    } catch (e: unknown) {
      // The call is registered before the request goes out, so a failed send
      // otherwise leaves an entry nobody waits on: this throws, `promise` never
      // gets a handler, and the timeout later rejects it into an unhandled
      // rejection. Settling retires the timer and the entry with it; the
      // rejection is absorbed so the send error is the one the caller sees.
      this.registry.settle({
        action: CHANNEL_RPC_RESPONSE,
        id,
        ok: false,
        error: {
          name: (e as Error)?.name ?? 'Error',
          message: (e as Error)?.message ?? String(e),
        },
      })
      promise.catch(() => {})
      throw e
    }

    const result = await promise
    if (!this.validateResult) {
      return result
    }

    // A capability runs on the peer's machine and answers with whatever it
    // likes, so this is the point where a value that has been through nothing
    // enters a server-side command. Checking it here means a client on an
    // older build fails the call it answered, rather than the command failing
    // later somewhere that had no reason to expect a bad shape.
    try {
      await this.validateResult(funcName, result)
    } catch (e: unknown) {
      throw new ChannelRPCError(
        `Invalid result from "${funcName}": ${(e as Error)?.message ?? String(e)}`,
        'invalid'
      )
    }
    return result
  }
}

/**
 * Checks a capability's answer against the schema generated for its declared
 * return type.
 *
 * A capability is declared as a function like any other, so codegen has
 * already produced a schema for what it returns — the same one an agent tool
 * or an HTTP response is checked against. Nothing about the value arriving
 * from a peer's machine rather than from local code changes what it is
 * supposed to look like, and a caller should not have to restate the shape it
 * already declared.
 *
 * A name with no function metadata is left alone: it is a capability this app
 * never declared a contract for, and inventing a failure for it would break
 * callers who deliberately treat the answer as opaque.
 */
export const createChannelRPCResultValidator =
  (
    singletonServices: Pick<CoreSingletonServices, 'logger' | 'schema'>,
    packageName: string | null = null
  ) =>
  async (funcName: string, result: unknown): Promise<void> => {
    const pikkuFuncId = pikkuState(packageName, 'rpc', 'meta')[funcName]
    if (!pikkuFuncId) {
      return
    }
    const schemaName = pikkuState(packageName, 'function', 'meta')[pikkuFuncId]
      ?.outputSchemaName
    if (!schemaName) {
      return
    }
    await validateSchema(
      singletonServices.logger,
      singletonServices.schema,
      schemaName,
      result,
      packageName
    )
  }

/**
 * Answers reverse RPC requests arriving on a channel.
 *
 * `capabilities` is the authorisation boundary, not a convenience: the peer is
 * asking this process to execute code, so only explicitly listed names run. A
 * name absent from the map is refused the same way an unknown one is, so the
 * server cannot probe for what a client can do.
 */
export const createChannelRPCResponder = ({
  capabilities,
  send,
}: {
  capabilities: Record<string, (data: any) => Promise<unknown> | unknown>
  send: (data: unknown) => Promise<void> | void
}) => {
  return async (message: unknown): Promise<boolean> => {
    if (!isChannelRPCRequest(message)) {
      return false
    }

    // Own properties only. A plain object literal still inherits from
    // `Object.prototype`, so a peer asking for `toString` or `constructor`
    // would otherwise resolve a real function and this would call it — names
    // the host never listed, through the boundary that is supposed to list
    // them. `typeof` covers a map that carries a non-function value.
    const capability = Object.prototype.hasOwnProperty.call(
      capabilities,
      message.funcName
    )
      ? capabilities[message.funcName]
      : undefined
    let response: ChannelRPCResponse

    if (typeof capability !== 'function') {
      response = {
        action: CHANNEL_RPC_RESPONSE,
        id: message.id,
        ok: false,
        error: {
          name: 'RPCNotFoundError',
          message: `Capability not exposed: ${message.funcName}`,
        },
      }
    } else {
      try {
        response = {
          action: CHANNEL_RPC_RESPONSE,
          id: message.id,
          ok: true,
          result: await capability(message.data),
        }
      } catch (e: unknown) {
        const error = e as Error
        response = {
          action: CHANNEL_RPC_RESPONSE,
          id: message.id,
          ok: false,
          error: {
            name: error?.name ?? 'Error',
            message: error?.message ?? String(e),
          },
        }
      }
    }

    await send(response)
    return true
  }
}
