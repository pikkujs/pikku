import {
  ChannelDeploymentService,
  createChannelRPCResultValidator,
} from './channel-rpc.js'
import type { ChannelRPCResultValidator } from './channel-rpc.js'
import type { PikkuChannel } from './channel.types.js'
import { getSingletonServices } from '../../pikku-state.js'

/**
 * Reverse-RPC transports, one per open connection.
 *
 * A registry is needed because the two halves of a call arrive as separate
 * channel messages: the request is written while a command is running, the
 * response comes back later on its own route with no reference to that
 * invocation other than the connection it shares.
 */
const hostRPCByChannel = new Map<string, ChannelDeploymentService>()

/**
 * The reverse-RPC transport for a connection, created on first use.
 *
 * Handing this to a function as its `deploymentService` is what lets
 * `rpc.remote(...)` reach a peer that has no address of its own — the open
 * socket is the route.
 *
 * `options` apply only to the call that creates the transport: one connection
 * has one transport shared by every command on it, so the first caller's
 * timeout and validator are the connection's.
 */
export const getChannelHostRPC = (
  channel: PikkuChannel<unknown, any>,
  options: {
    timeoutMs?: number
    validateResult?: ChannelRPCResultValidator
  } = {}
): ChannelDeploymentService => {
  let service = hostRPCByChannel.get(channel.channelId)
  if (!service) {
    service = new ChannelDeploymentService(
      (data) => channel.send(data),
      options
    )
    hostRPCByChannel.set(channel.channelId, service)
  }
  return service
}

/**
 * The implementation behind `channel.remote(...)`.
 *
 * Kept out of the channel handler so the transport is created on first use
 * rather than on every connection: a channel nobody calls back on should not
 * pay for a registry, and a handler has no services to build a validator with.
 */
export const channelRemote = async (
  channel: PikkuChannel<unknown, any, any>,
  funcName: string,
  data?: unknown
): Promise<unknown> =>
  getChannelHostRPC(channel, {
    // The transport is the only place that sees every reverse call, so no
    // caller has to ask for its answer to be checked.
    validateResult: createChannelRPCResultValidator(getSingletonServices()),
  }).invoke(funcName, data)

/**
 * Routes a response frame back to the call it belongs to. Returns false when
 * the connection has no transport or the id is unknown, so a stray or late
 * frame is dropped rather than throwing.
 */
export const handleChannelRPCResponse = (
  channelId: string,
  message: unknown
): boolean => hostRPCByChannel.get(channelId)?.handleResponse(message) ?? false

/**
 * Fails everything still in flight and forgets the connection. Must run on
 * disconnect: without it a caller waits out the full timeout on a socket that
 * is already gone, and the map grows for the life of the process.
 */
export const releaseChannelHostRPC = async (
  channelId: string
): Promise<void> => {
  const service = hostRPCByChannel.get(channelId)
  if (service) {
    hostRPCByChannel.delete(channelId)
    await service.stop()
  }
}
