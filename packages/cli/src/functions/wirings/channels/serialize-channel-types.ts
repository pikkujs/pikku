/**
 * Generates type definitions for WebSocket channel wirings
 */
export const serializeChannelTypes = (functionTypesImportPath: string) => {
  return `/**

 * Channel-specific type definitions for tree-shaking optimization
 */

import { CoreChannel, wireChannel as wireChannelCore } from '@pikku/core/channel'
import { CorePikkuFunctionConfig } from '@pikku/core'
import { AssertHTTPWiringParams } from '@pikku/core/http'
import type { PikkuFunction, PikkuFunctionSessionless, PikkuPermission, PikkuMiddleware } from '${functionTypesImportPath}'

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
  CorePikkuFunctionConfig<PikkuFunctionSessionless<void, any, ChannelData>, PikkuPermission<void>, PikkuMiddleware>,
  CorePikkuFunctionConfig<PikkuFunctionSessionless<void, void, ChannelData>, PikkuPermission<void>, PikkuMiddleware>,
  CorePikkuFunctionConfig<PikkuFunctionSessionless<any, any, ChannelData> | PikkuFunction<any, any, ChannelData>, PikkuPermission<any>, PikkuMiddleware>,
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
    | PikkuFunctionSessionless<void, Out, unknown>
    | CorePikkuFunctionConfig<PikkuFunctionSessionless<void, Out, unknown>, PikkuPermission<void>, PikkuMiddleware>
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
    | PikkuFunctionSessionless<void, void, unknown>
    | CorePikkuFunctionConfig<PikkuFunctionSessionless<void, void, unknown>, PikkuPermission<void>, PikkuMiddleware>
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
    | PikkuFunctionSessionless<In, Out, unknown>
    | CorePikkuFunctionConfig<PikkuFunctionSessionless<In, Out, unknown>, PikkuPermission<In>, PikkuMiddleware>
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
