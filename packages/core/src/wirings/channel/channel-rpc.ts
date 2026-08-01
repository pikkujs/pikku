import type { DeploymentService } from '../../services/deployment-service.js'

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
    public readonly reason: 'timeout' | 'closed' | 'remote' | 'invalid'
  ) {
    super(message)
    this.name = 'ChannelRPCError'
  }
}

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

  constructor(
    private readonly send: (data: unknown) => Promise<void> | void,
    timeoutMs?: number
  ) {
    this.registry = new ChannelRPCRegistry(timeoutMs)
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
    const request: ChannelRPCRequest = {
      action: CHANNEL_RPC_REQUEST,
      id,
      funcName,
      data,
      traceId,
    }
    await this.send(request)
    return promise
  }
}

/**
 * Calls a capability on the connected client and checks what comes back.
 *
 * Two problems are solved together, because they have the same cause. A client
 * capability is not one of this server's functions, so it is absent from the
 * generated RPC map and `rpc.remote` cannot type it — every caller would
 * otherwise cast, and a cast is exactly the thing that makes a peer's answer
 * look like a checked value. `parse` is that check: it runs on a payload that
 * arrived from someone else's machine, and a call whose answer does not match
 * fails as a call rather than as a `TypeError` several lines later, in code
 * that had no reason to expect one.
 *
 * @example
 * const { sha } = await callClientCapability({
 *   rpc,
 *   name: 'localCheckout',
 *   parse: (result) => {
 *     if (typeof (result as any)?.sha !== 'string') {
 *       throw new Error('expected { sha: string }')
 *     }
 *     return result as { sha: string }
 *   },
 * })
 */
export const callClientCapability = async <T>({
  rpc,
  name,
  data,
  parse,
}: {
  rpc: { remote: (...args: any[]) => Promise<any> }
  name: string
  data?: unknown
  parse: (result: unknown) => T
}): Promise<T> => {
  const result = await rpc.remote(name as never, data as never)
  try {
    return parse(result)
  } catch (e: unknown) {
    throw new ChannelRPCError(
      `Invalid result from client capability "${name}": ${(e as Error)?.message ?? String(e)}`,
      'invalid'
    )
  }
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

    const capability = capabilities[message.funcName]
    let response: ChannelRPCResponse

    if (!capability) {
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
