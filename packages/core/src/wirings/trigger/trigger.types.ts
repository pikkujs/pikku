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
  name: string
  func: PikkuFunctionConfig
  description?: string
  tags?: string[]
  graph?: true
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
