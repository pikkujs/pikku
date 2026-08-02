import type { DeploymentService } from '../../services/deployment-service.js'
import { ChannelRPCRegistry } from './channel-rpc-registry.js'
import {
  CHANNEL_RPC_REQUEST,
  CHANNEL_RPC_RESPONSE,
  ChannelRPCError,
  isChannelRPCPending,
  isChannelRPCResponse,
  type ChannelRPCRequest,
  type ChannelRPCValidator,
} from './channel-rpc.types.js'

/**
 * `remote` for channels that only ever flow one way — a server-sent stream, an
 * agent's output, a local CLI. Nothing is listening for a request on them, so
 * the call is refused rather than waiting out a timeout.
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
 * A `DeploymentService` whose transport is an open channel rather than an
 * address, so a server-side function can call back into a peer that has no
 * inbound route of its own.
 *
 * It slots into the existing `services.deploymentService` hole, leaving
 * `rpc.remote` resolution, session propagation and traceId plumbing unchanged.
 */
export class ChannelDeploymentService implements DeploymentService {
  public readonly registry: ChannelRPCRegistry
  private readonly validateInput?: ChannelRPCValidator
  private readonly validateResult?: ChannelRPCValidator

  constructor(
    private readonly send: (data: unknown) => Promise<void> | void,
    options: {
      timeoutMs?: number
      validateInput?: ChannelRPCValidator
      validateResult?: ChannelRPCValidator
    } = {}
  ) {
    this.registry = new ChannelRPCRegistry(options.timeoutMs)
    this.validateInput = options.validateInput
    this.validateResult = options.validateResult
  }

  public async init(): Promise<void> {}

  public async start(): Promise<void> {}

  public async stop(): Promise<void> {
    this.registry.rejectAll('Deployment service stopped')
  }

  /** The channel owner must call this — the service has no read side. */
  public handleResponse(message: unknown): boolean {
    if (isChannelRPCPending(message)) {
      return this.registry.hold(message.id)
    }
    return isChannelRPCResponse(message) ? this.registry.settle(message) : false
  }

  /**
   * `session` is accepted to satisfy `DeploymentService` and deliberately not
   * sent: the peer runs the capability as itself, on its own machine, so a
   * session on the wire would carry the caller's credentials while authorising
   * nothing.
   */
  public async invoke(
    funcName: string,
    data: unknown,
    _session?: unknown,
    traceId?: string
  ): Promise<unknown> {
    // Not a security control — the peer must check what it is handed, and a
    // hostile caller would send arguments that pass. It catches version drift
    // and fails it here rather than inside the peer's process.
    if (this.validateInput) {
      try {
        await this.validateInput(funcName, data)
      } catch (e: unknown) {
        throw new ChannelRPCError(
          `Invalid arguments for "${funcName}": ${(e as Error)?.message ?? String(e)}`,
          'invalid'
        )
      }
    }

    const { id, promise } = this.registry.register()
    // A closed registry answers with an already-rejected promise and no id.
    // Returning it before the send keeps that rejection from sitting unobserved.
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
      // would otherwise leave an entry whose timeout rejects into an unhandled
      // rejection with nobody waiting on it.
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

    // The peer answers with whatever it likes, so this is where a value that
    // has been through nothing enters a server-side command.
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
