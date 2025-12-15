/**
 * Generates type definitions for trigger wirings
 */
export const serializeTriggerTypes = (
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string
) => {
  return `/**
 * Trigger-specific type definitions for tree-shaking optimization
 */

import { CorePikkuTriggerFunction, CorePikkuTriggerFunctionConfig, wireTrigger as wireTriggerCore } from '@pikku/core/trigger'
${singletonServicesTypeImport}
import type { ZodLike } from '@pikku/core'

${singletonServicesTypeName !== 'SingletonServices' ? `type SingletonServices = ${singletonServicesTypeName}` : ''}

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
 * Helper type to infer the output type from a Zod schema
 */
type InferZodOutput<T> = T extends ZodLike<infer U> ? U : never

/**
 * Configuration object for trigger functions with Zod schema validation.
 * Use this when you want to define input/output schemas using Zod.
 * Types are automatically inferred from the schemas.
 */
export type PikkuTriggerFunctionConfigWithSchema<
  InputSchema extends ZodLike,
  OutputSchema extends ZodLike | undefined = undefined
> = {
  title?: string
  description?: string
  tags?: string[]
  func: PikkuTriggerFunction<
    InferZodOutput<InputSchema>,
    OutputSchema extends ZodLike ? InferZodOutput<OutputSchema> : unknown
  >
  input: InputSchema
  output?: OutputSchema
}

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
export function pikkuTriggerFunc<
  InputSchema extends ZodLike,
  OutputSchema extends ZodLike | undefined = undefined
>(
  config: PikkuTriggerFunctionConfigWithSchema<InputSchema, OutputSchema>
): PikkuTriggerFunctionConfig<InferZodOutput<InputSchema>, OutputSchema extends ZodLike ? InferZodOutput<OutputSchema> : unknown, InputSchema, OutputSchema>
export function pikkuTriggerFunc<TInput, TOutput = unknown>(
  triggerOrConfig:
    | PikkuTriggerFunction<TInput, TOutput>
    | PikkuTriggerFunctionConfig<TInput, TOutput>
): PikkuTriggerFunctionConfig<TInput, TOutput>
export function pikkuTriggerFunc(triggerOrConfig: any) {
  if (typeof triggerOrConfig === 'function') {
    return { func: triggerOrConfig }
  }
  return triggerOrConfig
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
`
}
