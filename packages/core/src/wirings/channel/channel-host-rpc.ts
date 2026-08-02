import {
  ChannelDeploymentService,
  createChannelRPCInputValidator,
  createChannelRPCResultValidator,
} from './channel-rpc.js'
import type { ChannelRPCValidator } from './channel-rpc.js'
import type { PikkuChannel } from './channel.types.js'
import { getSingletonServices } from '../../pikku-state.js'

/** Reverse-RPC transports, one per open connection. */
const hostRPCByChannel = new Map<string, ChannelDeploymentService>()

/**
 * The transport for a connection, created on first use. `options` apply only
 * to the call that creates it — one connection has one transport, so the first
 * caller's timeout and validators become the connection's.
 */
export const getChannelHostRPC = (
  channel: PikkuChannel<unknown, any>,
  options: {
    timeoutMs?: number
    validateInput?: ChannelRPCValidator
    validateResult?: ChannelRPCValidator
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
 * Kept out of the channel handler so a channel nobody calls back on pays for no
 * registry, and because a handler has no services to build a validator with.
 */
export const channelRemote = async (
  channel: PikkuChannel<unknown, any, any>,
  funcName: string,
  data?: unknown
): Promise<unknown> =>
  getChannelHostRPC(channel, {
    validateInput: createChannelRPCInputValidator(getSingletonServices()),
    validateResult: createChannelRPCResultValidator(getSingletonServices()),
  }).invoke(funcName, data)

/** False for an unknown connection or id, so a stray frame is dropped. */
export const handleChannelRPCResponse = (
  channelId: string,
  message: unknown
): boolean => hostRPCByChannel.get(channelId)?.handleResponse(message) ?? false

/**
 * Must run on disconnect: without it a caller waits out the full timeout on a
 * dead socket, and the map grows for the life of the process.
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
