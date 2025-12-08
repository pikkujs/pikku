import type { CorePikkuTriggerFunctionConfig } from '../../function/functions.types.js'

/**
 * The trigger interaction object passed to trigger functions via the wire.
 * Call trigger() to fire the trigger and start a new workflow/execution.
 */
export interface PikkuTrigger<TOutput = unknown> {
  trigger: (data: TOutput) => void
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
 * Core trigger definition for registration.
 *
 * @template TConfig - Configuration type
 * @template TOutput - Output type
 */
export interface CoreTrigger<
  TConfig = unknown,
  TOutput = unknown,
  TriggerFunctionConfig extends CorePikkuTriggerFunctionConfig<
    TConfig,
    TOutput
  > = CorePikkuTriggerFunctionConfig<TConfig, TOutput>,
> {
  /** Unique name for this trigger */
  name: string
  /** The trigger function configuration */
  func: TriggerFunctionConfig
  /** Configuration to pass to the trigger function */
  config: TConfig
  /** Optional description */
  description?: string
  /** Optional tags for categorization */
  tags?: string[]
}

/**
 * Represents a trigger instance with teardown capability
 */
export interface TriggerInstance {
  name: string
  teardown: () => void | Promise<void>
}
