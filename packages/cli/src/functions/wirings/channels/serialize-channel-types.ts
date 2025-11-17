/**
 * Generates type definitions for WebSocket channel wirings
 */
export const serializeChannelTypes = (functionTypesImportPath: string) => {
  return `/**

 * Channel-specific type definitions for tree-shaking optimization
 */

import { CoreChannel, wireChannel as wireChannelCore } from '@pikku/core/channel'
import { AssertHTTPWiringParams } from '@pikku/core/http'
import type { PikkuFunctionConfig, PikkuFunctionSessionless, PikkuPermission, PikkuMiddleware } from '${functionTypesImportPath}'

/**
 * Type definition for WebSocket channels with typed data exchange.
 * Supports connection, disconnection, and message handling.
 * Accepts both session-based (PikkuFunction) and sessionless (PikkuFunctionSessionless) functions.
 *
 * @template ChannelData - Type of data exchanged through the channel
 * @template Channel - String literal type for the channel name
 */
type ChannelWiring<ChannelData, Channel extends string> = CoreChannel<
  ChannelData,
  Channel,
  PikkuFunctionConfig<void, any, 'channel' | 'session' | 'rpc'>,
  PikkuFunctionConfig<void, void, 'channel' | 'session' | 'rpc'>,
  PikkuFunctionConfig<any, any, 'channel' | 'session' | 'rpc'>,
  PikkuPermission,
  PikkuMiddleware
>

/**
 * Creates a function that handles WebSocket channel connections.
 * Called when a client connects to a channel.
 *
 * @template Out - Output type for connection response
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 */
export const pikkuChannelConnectionFunc = <Out = unknown>(
  func:
    | PikkuFunctionSessionless<void, Out, 'channel' | 'session' | 'rpc'>
    | PikkuFunctionConfig<void, Out, 'channel' | 'session' | 'rpc'>
) => {
  return typeof func === 'function' ? { func } : func
}

/**
 * Creates a function that handles WebSocket channel disconnections.
 * Called when a client disconnects from a channel.
 *
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 */
export const pikkuChannelDisconnectionFunc = (
  func:
    | PikkuFunctionSessionless<void, void, 'channel'>
    | PikkuFunctionConfig<void, void, 'channel' | 'session' | 'rpc'>
) => {
  return typeof func === 'function' ? { func } : func
}

/**
 * Creates a function that handles WebSocket channel messages.
 * Called when a message is received on a channel.
 * This is the same as pikkuSessionlessFunc but with ChannelData = unknown by default.
 *
 * @template In - Input type for channel messages
 * @template Out - Output type for channel responses
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 */
export const pikkuChannelFunc = <In, Out = unknown>(
  func:
    | PikkuFunctionSessionless<In, Out, 'channel' | 'session' | 'rpc'>
    | PikkuFunctionConfig<In, Out, 'channel' | 'session' | 'rpc'>
) => {
  return typeof func === 'function' ? { func } : func
}

/**
 * Registers a WebSocket channel with the Pikku framework.
 *
 * @template ChannelData - Type of data associated with the channel
 * @template Channel - String literal type for the channel name
 * @param channel - Channel definition with connection, disconnection, and message handlers
 */
export const wireChannel = <ChannelData, Channel extends string>(
  channel: ChannelWiring<ChannelData, Channel> & AssertHTTPWiringParams<ChannelData, Channel>
) => {
  wireChannelCore(channel as any) // TODO
}
`
}
