import type { CorePikkuTriggerFunctionConfig } from '../../function/functions.types.js'

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
  /** Input to pass to the trigger function */
  input: TInput
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
