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

import { CorePikkuTriggerFunction, CorePikkuTriggerFunctionConfig, CoreTriggerSource, CoreTrigger, wireTrigger as wireTriggerCore, wireTriggerSource as wireTriggerSourceCore } from '@pikku/core/trigger'
import type { CoreNodeConfig } from '@pikku/core/forge-node'
${singletonServicesTypeImport}
import type { StandardSchemaV1 } from '@standard-schema/spec'

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
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = CorePikkuTriggerFunctionConfig<TInput, TOutput, SingletonServices, InputSchema, OutputSchema>

/**
 * Helper type to infer the output type from a Standard Schema
 */
type InferSchemaOutput<T> = T extends StandardSchemaV1<any, infer Output> ? Output : never

/**
 * Configuration object for trigger functions with Zod schema validation.
 * Use this when you want to define input/output schemas using Zod.
 * Types are automatically inferred from the schemas.
 */
export type PikkuTriggerFunctionConfigWithSchema<
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = {
  title?: string
  description?: string
  tags?: string[]
  func: PikkuTriggerFunction<
    InferSchemaOutput<InputSchema>,
    OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown
  >
  input: InputSchema
  output?: OutputSchema
  node?: CoreNodeConfig
}

/**
 * Type definition for trigger wirings.
 * Declares a trigger name and its target pikku function.
 */
export type TriggerWiring = CoreTrigger

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
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  config: PikkuTriggerFunctionConfigWithSchema<InputSchema, OutputSchema>
): PikkuTriggerFunctionConfig<InferSchemaOutput<InputSchema>, OutputSchema extends StandardSchemaV1 ? InferSchemaOutput<OutputSchema> : unknown, InputSchema, OutputSchema>
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
 * Declares a trigger name and its target pikku function.
 * Runs everywhere — inspector extracts at build time.
 *
 * @param trigger - Trigger definition with name and function config
 */
export const wireTrigger = (
  trigger: TriggerWiring
) => {
  wireTriggerCore(trigger as any)
}

/**
 * Registers a trigger source with the Pikku framework.
 * Provides the subscription function and input data.
 * Only imported in the trigger worker process.
 *
 * @param source - Trigger source with name, func, and input
 */
export const wireTriggerSource = <TInput = unknown, TOutput = unknown>(
  source: CoreTriggerSource<TInput, TOutput>
) => {
  wireTriggerSourceCore(source)
}
`
}
