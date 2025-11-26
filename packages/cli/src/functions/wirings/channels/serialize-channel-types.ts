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
import type { ZodLike, CorePermissionGroup } from '@pikku/core'

/**
 * Helper type to infer the output type from a Zod schema
 */
type InferZodOutput<T> = T extends ZodLike<infer U> ? U : never

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
 * Configuration object for channel functions with Zod schema validation.
 */
type PikkuChannelFuncConfigWithSchema<
  InputSchema extends ZodLike,
  OutputSchema extends ZodLike | undefined = undefined
> = {
  name?: string
  tags?: string[]
  expose?: boolean
  internal?: boolean
  func: PikkuFunctionSessionless<
    InferZodOutput<InputSchema>,
    OutputSchema extends ZodLike ? InferZodOutput<OutputSchema> : unknown,
    'channel' | 'session' | 'rpc'
  >
  auth?: boolean
  permissions?: CorePermissionGroup<PikkuPermission<InferZodOutput<InputSchema>>>
  middleware?: PikkuMiddleware[]
  input: InputSchema
  output?: OutputSchema
}

/**
 * Creates a function that handles WebSocket channel messages.
 * Called when a message is received on a channel.
 *
 * Supports two patterns:
 * 1. Generic types: \`pikkuChannelFunc<Input, Output>({ func: ... })\`
 * 2. Zod schemas: \`pikkuChannelFunc({ input: z.object(...), func: ... })\`
 *
 * @template In - Input type for channel messages (inferred from schema if provided)
 * @template Out - Output type for channel responses (inferred from schema if provided)
 * @param func - Function definition, either direct function or configuration object
 * @returns The normalized configuration object
 *
 * @example
 * \\\`\\\`\\\`typescript
 * // Pattern 1: Using generic types
 * const handleMessage = pikkuChannelFunc<{text: string}, {received: boolean}>({
 *   func: async (_services, { text }) => ({ received: true })
 * })
 *
 * // Pattern 2: Using Zod schemas
 * const messageInput = z.object({ text: z.string() })
 * const messageOutput = z.object({ received: z.boolean() })
 *
 * const handleMessage = pikkuChannelFunc({
 *   input: messageInput,
 *   output: messageOutput,
 *   func: async (_services, { text }) => ({ received: true })
 * })
 * \\\`\\\`\\\`
 */
export function pikkuChannelFunc<
  InputSchema extends ZodLike,
  OutputSchema extends ZodLike | undefined = undefined
>(
  config: PikkuChannelFuncConfigWithSchema<InputSchema, OutputSchema>
): PikkuFunctionConfig<InferZodOutput<InputSchema>, OutputSchema extends ZodLike ? InferZodOutput<OutputSchema> : unknown, 'channel' | 'session' | 'rpc'>
export function pikkuChannelFunc<In, Out = unknown>(
  func:
    | PikkuFunctionSessionless<In, Out, 'channel' | 'session' | 'rpc'>
    | PikkuFunctionConfig<In, Out, 'channel' | 'session' | 'rpc'>
): PikkuFunctionConfig<In, Out, 'channel' | 'session' | 'rpc'>
export function pikkuChannelFunc(func: any) {
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
