import {
  ChannelRPCError,
  type ChannelRPCResponse,
} from './channel-rpc.types.js'

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
  awaitingHuman?: boolean
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
   * Stops the clock on a call whose peer is asking a human. The timeout exists
   * to bound a peer that has gone away, and a person reading a prompt is not
   * that; `rejectAll` still fails the call the moment the socket drops.
   *
   * Returns false for an unknown id — a pending frame for a call that already
   * timed out is stale, not an error.
   */
  public hold(id: string): boolean {
    const call = this.pending.get(id)
    if (!call || call.awaitingHuman) {
      return false
    }
    clearTimeout(call.timer)
    call.timer = undefined
    call.awaitingHuman = true
    return true
  }

  /** Returns false for an unknown id, so a late reply is dropped. */
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
      // Peer input: a non-string name or message falls back rather than being
      // attached to an Error, where it would surface as `[object Object]`.
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

  /** Without this a caller awaits the full timeout on a connection that is gone. */
  public rejectAll(reason: string = 'Channel closed'): void {
    this.closed = true
    for (const [, call] of this.pending) {
      clearTimeout(call.timer)
      call.reject(new ChannelRPCError(reason, 'closed'))
    }
    this.pending.clear()
  }
}
