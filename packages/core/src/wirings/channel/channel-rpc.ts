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
  session?: unknown
  traceId?: string
}

export interface ChannelRPCResponse {
  action: typeof CHANNEL_RPC_RESPONSE
  id: string
  ok: boolean
  result?: unknown
  error?: { name: string; message: string }
}

export const isChannelRPCRequest = (
  message: unknown
): message is ChannelRPCRequest =>
  typeof message === 'object' &&
  message !== null &&
  (message as any).action === CHANNEL_RPC_REQUEST

export const isChannelRPCResponse = (
  message: unknown
): message is ChannelRPCResponse =>
  typeof message === 'object' &&
  message !== null &&
  (message as any).action === CHANNEL_RPC_RESPONSE

/**
 * The error a caller sees when the peer is gone or never answered. Callers
 * cannot distinguish "peer rejected" from "peer vanished" without this — a
 * dropped socket must not look like a resolved call.
 */
export class ChannelRPCError extends Error {
  constructor(
    message: string,
    public readonly reason: 'timeout' | 'closed' | 'remote'
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
      const error = new ChannelRPCError(
        response.error?.message ?? 'Remote channel RPC failed',
        'remote'
      )
      error.name = response.error?.name ?? error.name
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

  public async invoke(
    funcName: string,
    data: unknown,
    session?: unknown,
    traceId?: string
  ): Promise<unknown> {
    const { id, promise } = this.registry.register()
    const request: ChannelRPCRequest = {
      action: CHANNEL_RPC_REQUEST,
      id,
      funcName,
      data,
      session,
      traceId,
    }
    await this.send(request)
    return promise
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
