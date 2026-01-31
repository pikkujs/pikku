import type { CoreSingletonServices } from '../../types/core.types.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * The trigger interaction object passed to trigger functions via the wire.
 * Call trigger() to fire the trigger and start a new workflow/execution.
 */
export interface PikkuTrigger<TOutput = unknown> {
  invoke: (data: TOutput) => void
}

/**
 * Metadata for registered triggers stored in state.
 */
export type TriggerMeta = Record<
  string,
  {
    pikkuFuncName: string
    name: string
    description?: string
    tags?: string[]
  }
>

/**
 * A trigger function that sets up a subscription and returns a teardown function.
 * The trigger is fired via wire.trigger.invoke(data).
 *
 * @template TInput - Input type (configuration passed when wired)
 * @template TOutput - Output type produced when trigger fires
 * @template Services - Services available to the trigger
 */
export type CorePikkuTriggerFunction<
  TInput = unknown,
  TOutput = unknown,
  Services extends CoreSingletonServices = CoreSingletonServices,
> = (
  services: Services,
  input: TInput,
  wire: { trigger: { invoke: (data: TOutput) => void } }
) => Promise<() => void | Promise<void>>

/**
 * Configuration object for creating a trigger function with metadata
 */
export type CorePikkuTriggerFunctionConfig<
  TInput = unknown,
  TOutput = unknown,
  Services extends CoreSingletonServices = CoreSingletonServices,
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
> = {
  /** Optional human-readable title for the trigger */
  title?: string
  /** Optional description of what the trigger does */
  description?: string
  /** Optional tags for categorization */
  tags?: string[]
  /** The trigger function */
  func: CorePikkuTriggerFunction<TInput, TOutput, Services>
  /** Optional Zod schema for input validation */
  input?: InputSchema
  /** Optional Zod schema for output validation */
  output?: OutputSchema
}

/**
 * Factory function for creating trigger functions
 * Supports both direct function and configuration object syntax
 *
 * @example
 * ```typescript
 * // Direct function syntax
 * export const redisSubscribeTrigger = pikkuTriggerFunc<
 *   { channel: string },
 *   { message: string }
 * >(async ({ redis }, { channel }, { trigger }) => {
 *   const subscriber = redis.duplicate()
 *   await subscriber.subscribe(channel, (msg) => {
 *     trigger.invoke({ message: msg })
 *   })
 *   return () => subscriber.unsubscribe()
 * })
 *
 * // Configuration object syntax with metadata
 * export const redisSubscribeTrigger = pikkuTriggerFunc({
 *   title: 'Redis Subscribe Trigger',
 *   description: 'Listens to Redis pub/sub channel',
 *   input: z.object({ channel: z.string() }),
 *   output: z.object({ message: z.string() }),
 *   func: async ({ redis }, { channel }, { trigger }) => {
 *     const subscriber = redis.duplicate()
 *     await subscriber.subscribe(channel, (msg) => {
 *       trigger.invoke({ message: msg })
 *     })
 *     return () => subscriber.unsubscribe()
 *   }
 * })
 * ```
 */
export const pikkuTriggerFunc = <
  TInput = unknown,
  TOutput = unknown,
  Services extends CoreSingletonServices = CoreSingletonServices,
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
>(
  triggerOrConfig:
    | CorePikkuTriggerFunction<TInput, TOutput, Services>
    | CorePikkuTriggerFunctionConfig<
        TInput,
        TOutput,
        Services,
        InputSchema,
        OutputSchema
      >
): CorePikkuTriggerFunctionConfig<
  TInput,
  TOutput,
  Services,
  InputSchema,
  OutputSchema
> => {
  if (typeof triggerOrConfig === 'function') {
    return { func: triggerOrConfig }
  }
  return triggerOrConfig
}

/**
 * Core trigger definition for registration.
 *
 * @template TInput - Input type (configuration passed when wired)
 * @template TOutput - Output type
 */
export interface CoreTrigger<
  TInput = unknown,
  TOutput = unknown,
  TriggerFunctionConfig extends CorePikkuTriggerFunctionConfig<
    TInput,
    TOutput
  > = CorePikkuTriggerFunctionConfig<TInput, TOutput>,
> {
  /** Unique name for this trigger */
  name: string
  /** The trigger function configuration */
  func: TriggerFunctionConfig
  /** Optional description */
  description?: string
  /** Optional tags for categorization */
  tags?: string[]
  /** Whether this trigger is used by a graph workflow */
  graph?: true
}

/**
 * Represents a trigger instance with teardown capability
 */
export interface TriggerInstance {
  name: string
  teardown: () => void | Promise<void>
}

/**
 * A trigger source that provides the subscription function.
 * Only imported in the trigger worker process.
 *
 * @template TInput - Input type passed to the trigger function
 * @template TOutput - Output type produced when trigger fires
 */
export interface CoreTriggerSource<TInput = unknown, TOutput = unknown> {
  /** Must match a wireTrigger name */
  name: string
  /** The trigger function config that sets up the subscription */
  func: CorePikkuTriggerFunctionConfig<TInput, TOutput>
  /** Input data passed to the trigger function */
  input: TInput
}
