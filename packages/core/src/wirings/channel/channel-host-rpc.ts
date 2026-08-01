import { ChannelDeploymentService } from './channel-rpc.js'
import type { ChannelRPCResultValidator } from './channel-rpc.js'
import type { PikkuChannel } from './channel.types.js'

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
