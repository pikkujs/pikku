/**
 * Generates type definitions for trigger wirings
 */
export const serializeTriggerTypes = (
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  { addon = false }: { addon?: boolean } = {}
) => {
  return `/**
 * Trigger-specific type definitions for tree-shaking optimization
 */

${addon ? '' : `import { wireTrigger as wireTriggerCore, wireTriggerSource as wireTriggerSourceCore, wireTriggerWebhookSource as wireTriggerWebhookSourceCore } from '@pikku/core/trigger'\n`}import type { CoreTriggerWebhookSource, WebhookVerify, WebhookRequest, WebhookReceiveResult, WebhookLifecycleInput, WebhookCheckResult, WebhookSetupResult, WebhookTeardownInput, WebhookTeardownResult } from '@pikku/core/trigger'
import {
  CorePikkuTriggerFunction,
  CorePikkuTriggerFunctionConfig,${addon ? '' : `\n  CoreTrigger,`}
} from '@pikku/core/trigger'
import type { CoreNodeConfig } from '@pikku/core/node'
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
type PikkuTriggerFunction<
  TInput = unknown,
  TOutput = unknown
> = CorePikkuTriggerFunction<TInput, TOutput, SingletonServices>

/**
 * Configuration object for creating a trigger function with metadata
 */
type PikkuTriggerFunctionConfig<
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
type PikkuTriggerFunctionConfigWithSchema<
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
${addon ? '' : `type TriggerWiring = CoreTrigger\n`}
${
  addon
    ? ''
    : `/**
 * A trigger source with the subscription function, using project-specific services.
 *
 * @template TInput - Input type passed to the trigger function
 * @template TOutput - Output type produced when trigger fires
 */
type TriggerSource<
  TInput = unknown,
  TOutput = unknown
> = {
  name: string
  func: PikkuTriggerFunctionConfig<TInput, TOutput>
} & (unknown extends TInput ? { input?: TInput } : { input: TInput })
`
}
/**
 * One step of a webhook source: inline, a pikku function, or \`ref('addon:fn')\`.
 */
type WebhookSourceStep<In, Out> = {
  func: ${addon ? '(services: any, data: In, wire: any) => Promise<Out | void>' : "(services: Omit<SingletonServices, 'secrets'>, data: In, wire: any) => Promise<Out>"}
}

/**
 * A webhook source, using project-specific services.
 */
type TriggerWebhookSource<Events extends Record<string, StandardSchemaV1>> =
  Omit<CoreTriggerWebhookSource<Events>, 'verify' | 'receive' | 'check' | 'setup' | 'teardown'> & {
    verify?: WebhookVerify<${addon ? 'any' : "Omit<SingletonServices, 'secrets'>"}>
    receive?: WebhookSourceStep<WebhookRequest, WebhookReceiveResult>
    check?: WebhookSourceStep<WebhookLifecycleInput, WebhookCheckResult>
    setup?: WebhookSourceStep<WebhookLifecycleInput, WebhookSetupResult>
    teardown?: WebhookSourceStep<WebhookTeardownInput, WebhookTeardownResult>
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

${
  addon
    ? `
/**
 * Declares a webhook source this addon ships. An app that wires the addon
 * mounts its route and can register it with the provider, but the source
 * stays off until someone turns it on. Declaration only: nothing runs here.
 *
 * @param source - Webhook source with name, events and its steps
 */
export const wireTriggerWebhookSource = <
  Events extends Record<string, StandardSchemaV1> = Record<string, StandardSchemaV1>
>(
  _source: TriggerWebhookSource<Events>
) => {}
`
    : `
/**
 * Registers a trigger with the Pikku framework.
 * Declares a trigger name and its target pikku function.
 * Runs everywhere — inspector extracts at build time.
 *
 * @param trigger - Trigger definition with name and function config
 *
 * @example snippet: wireTrigger
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
 *
 * @example snippet: wireTriggerSource
 */
export const wireTriggerSource = <TInput = unknown, TOutput = unknown>(
  source: TriggerSource<TInput, TOutput>
) => {
  wireTriggerSourceCore(source as any)
}

/**
 * Receives a provider's webhooks as trigger events. Pikku mounts an open route
 * at \`route\` (default \`/webhooks/<name>\`) that runs \`receive\`, validates each
 * event against \`events\`, and queues it for the trigger named
 * \`<name>:<event>\`. \`check\`, \`setup\` and \`teardown\` register the route with
 * the provider at deploy, via \`pikku webhooks\`.
 *
 * @param source - Webhook source with name, events and its steps
 *
 * @example snippet: wireTriggerWebhookSource
 */
export const wireTriggerWebhookSource = <
  Events extends Record<string, StandardSchemaV1> = Record<string, StandardSchemaV1>
>(
  source: TriggerWebhookSource<Events>
) => {
  wireTriggerWebhookSourceCore(source as any)
}
`
}`
}
