/**
 * Generates type definitions for trigger wirings
 */
export const serializeTriggerTypes = (functionTypesImportPath: string) => {
  return `/**
 * Trigger-specific type definitions for tree-shaking optimization
 */

import { CorePikkuTriggerFunction, CorePikkuTriggerFunctionConfig, pikkuTriggerFunc as pikkuTriggerFuncCore, wireTrigger as wireTriggerCore, addTrigger as addTriggerCore } from '@pikku/core/trigger'
import type { SingletonServices } from '${functionTypesImportPath}'
import type { ZodLike } from '@pikku/core'

/**
 * A trigger function that sets up a subscription and returns a teardown function.
 * The trigger is fired via wire.trigger.invoke(data).
 *
 * @template TInput - Input type (configuration passed when wired)
 * @template TOutput - Output type produced when trigger fires
 */
export type PikkuTriggerFunction<
  TInput = unknown,
  TOutput = unknown
> = CorePikkuTriggerFunction<TInput, TOutput, SingletonServices>

/**
 * Configuration object for creating a trigger function with metadata
 */
export type PikkuTriggerFunctionConfig<
  TInput = unknown,
  TOutput = unknown,
  InputSchema extends ZodLike | undefined = undefined,
  OutputSchema extends ZodLike | undefined = undefined
> = CorePikkuTriggerFunctionConfig<TInput, TOutput, SingletonServices, InputSchema, OutputSchema>

/**
 * Type definition for trigger wirings.
 * Triggers set up subscriptions and fire events via wire.trigger.invoke(data).
 */
export type TriggerWiring<TInput = unknown, TOutput = unknown> = {
  name: string
  func: PikkuTriggerFunctionConfig<TInput, TOutput>
  input: TInput
  description?: string
  tags?: string[]
}

/**
 * Creates a trigger function configuration.
 * Use this to define trigger functions that set up subscriptions.
 *
 * @param triggerOrConfig - Function definition or configuration object
 * @returns The normalized configuration object
 *
 * @example
 * \`\`\`typescript
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
 * \`\`\`
 */
export const pikkuTriggerFunc = <
  TInput = unknown,
  TOutput = unknown,
  InputSchema extends ZodLike | undefined = undefined,
  OutputSchema extends ZodLike | undefined = undefined
>(
  triggerOrConfig:
    | PikkuTriggerFunction<TInput, TOutput>
    | PikkuTriggerFunctionConfig<TInput, TOutput, InputSchema, OutputSchema>
): PikkuTriggerFunctionConfig<TInput, TOutput, InputSchema, OutputSchema> => {
  return pikkuTriggerFuncCore(triggerOrConfig as any) as any
}

/**
 * Registers a trigger with the Pikku framework.
 * The trigger will be available for setup via setupTrigger.
 *
 * @param trigger - Trigger definition with name, function config, and input
 */
export const wireTrigger = <TInput = unknown, TOutput = unknown>(
  trigger: TriggerWiring<TInput, TOutput>
) => {
  wireTriggerCore(trigger as any)
}

/**
 * Registers a trigger function with the Pikku framework.
 *
 * @param triggerName - Unique name for the trigger
 * @param funcConfig - The trigger function configuration
 * @param packageName - Optional package name for external packages
 */
export const addTrigger = (
  triggerName: string,
  funcConfig: PikkuTriggerFunctionConfig<any, any>,
  packageName: string | null = null
) => {
  addTriggerCore(triggerName, funcConfig as any, packageName)
}
`
}
