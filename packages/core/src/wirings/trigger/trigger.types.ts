import type {
  CommonWireMeta,
  CoreSingletonServices,
} from '../../types/core.types.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CoreNodeConfig } from '../node/node.types.js'

// knowledge: decisions/security/a-trigger-event-runs-as-the-user-its-source-asserts.md
/**
 * Facts about a trigger event that its source asserts, kept apart from the
 * event data so that nothing in a payload the source received can set them.
 */
export interface TriggerInvokeOptions {
  /**
   * The user the event belongs to. The target runs as this user — its
   * credentials and stored session resolve for them — exactly as a queue job
   * or workflow run carrying a `pikkuUserId` does. Pass only a user the source
   * has established itself, such as the one whose credential it polled with;
   * never one read out of the event.
   */
  pikkuUserId?: string
}

export interface PikkuTrigger<TOutput = unknown> {
  invoke: (data: TOutput, options?: TriggerInvokeOptions) => void
}

/** Generated metadata for every wired trigger, keyed by name. */
export type TriggerMeta = Record<string, CommonWireMeta & { name: string }>

/** Generated metadata for every wired trigger source, keyed by name. */
export type TriggerSourceMeta = Record<
  string,
  { name: string; pikkuFuncId: string; packageName?: string }
>

/**
 * A trigger source's body: subscribes using `input`, calls `wire.trigger.invoke`
 * each time the event happens, and resolves to the function that unsubscribes.
 */
export type CorePikkuTriggerFunction<
  TInput = unknown,
  TOutput = unknown,
  Services extends CoreSingletonServices = CoreSingletonServices,
> = (
  services: Services,
  input: TInput,
  wire: { trigger: PikkuTrigger<TOutput> }
) => Promise<() => void | Promise<void>>

/**
 * A trigger source function with its schemas and descriptive metadata, as `pikkuTriggerFunc` returns it.
 */
export type CorePikkuTriggerFunctionConfig<
  TInput = unknown,
  TOutput = unknown,
  Services extends CoreSingletonServices = CoreSingletonServices,
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
> = {
  title?: string
  description?: string
  tags?: string[]
  func: CorePikkuTriggerFunction<TInput, TOutput, Services>
  input?: InputSchema
  output?: OutputSchema
  node?: CoreNodeConfig
}

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

/** What `wireTrigger` takes: the name a trigger source fires and the function run each time. */
export interface CoreTrigger<PikkuFunctionConfig = any> {
  /** What a `wireTriggerSource` points at to fire this trigger. It is the contract between the two, so both must spell it the same. */
  name: string
  /** The function to run each time the trigger fires. */
  func: PikkuFunctionConfig
  /** What firing this trigger means, for whoever is reading the wiring rather than writing it. */
  description?: string
  /** Filters this trigger in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
  tags?: string[]
}

export interface TriggerInstance {
  name: string
  teardown: () => void | Promise<void>
}

export type CoreTriggerSource<TInput = unknown, TOutput = unknown> = {
  /** Must match the name of a `wireTrigger` registration. */
  name: string
  func: CorePikkuTriggerFunctionConfig<
    TInput,
    TOutput,
    CoreSingletonServices,
    StandardSchemaV1 | undefined,
    StandardSchemaV1 | undefined
  >
} & (unknown extends TInput ? { input?: TInput } : { input: TInput })
