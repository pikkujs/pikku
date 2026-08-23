import type {
  CommonWireMeta,
  CoreSingletonServices,
} from '../../types/core.types.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CoreNodeConfig } from '../node/node.types.js'

export interface PikkuTrigger<TOutput = unknown> {
  invoke: (data: TOutput) => void
}

export type TriggerMeta = Record<string, CommonWireMeta & { name: string }>

export type TriggerSourceMeta = Record<
  string,
  { name: string; pikkuFuncId: string; packageName?: string }
>

export type CorePikkuTriggerFunction<
  TInput = unknown,
  TOutput = unknown,
  Services extends CoreSingletonServices = CoreSingletonServices,
> = (
  services: Services,
  input: TInput,
  wire: { trigger: { invoke: (data: TOutput) => void } }
) => Promise<() => void | Promise<void>>

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
