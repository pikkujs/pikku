import type { CoreSingletonServices } from '../../types/core.types.js'
import type {
  CoreTrigger,
  CoreTriggerSource,
  TriggerInstance,
  CorePikkuTriggerFunctionConfig,
} from './trigger.types.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'

/**
 * Registers a trigger with the Pikku framework.
 * Declares a trigger name and its target pikku function.
 * Runs everywhere. Inspector extracts at build time.
 */
export const wireTrigger = <
  TInput = unknown,
  TOutput = unknown,
  TriggerFunctionConfig extends CorePikkuTriggerFunctionConfig<
    TInput,
    TOutput
  > = CorePikkuTriggerFunctionConfig<TInput, TOutput>,
>(
  trigger: CoreTrigger<TInput, TOutput, TriggerFunctionConfig>
) => {
  const meta = pikkuState(null, 'trigger', 'meta')
  const triggerMeta = meta[trigger.name]
  if (!triggerMeta) {
    throw new Error(`Trigger metadata not found: ${trigger.name}`)
  }

  addFunction(triggerMeta.pikkuFuncName, trigger.func as any)

  const triggers = pikkuState(null, 'trigger', 'triggers')
  if (triggers.has(trigger.name)) {
    throw new Error(`Trigger already exists: ${trigger.name}`)
  }
  triggers.set(trigger.name, trigger as any)
}

/**
 * Registers a trigger source with the Pikku framework.
 * Provides the actual subscription function and input data.
 * Only imported in the trigger worker process.
 */
export const wireTriggerSource = <TInput = unknown, TOutput = unknown>(
  source: CoreTriggerSource<TInput, TOutput>
) => {
  const triggerSources = pikkuState(null, 'trigger', 'triggerSources')
  if (triggerSources.has(source.name)) {
    throw new Error(`Trigger source already exists: ${source.name}`)
  }
  triggerSources.set(source.name, source as any)
}

/**
 * Parameters for setting up a trigger
 */
export type SetupTriggerParams<TInput = unknown, TOutput = unknown> = {
  name: string
  singletonServices: CoreSingletonServices
  input: TInput
  onTrigger: (data: TOutput) => void | Promise<void>
}

/**
 * Sets up a registered trigger and starts listening for events.
 * Returns a TriggerInstance with a teardown function.
 *
 * @param name - The trigger name (must be registered via wireTrigger)
 * @param singletonServices - The singleton services
 * @param input - The input to pass to the trigger function
 * @param onTrigger - Callback invoked when the trigger fires
 */
export async function setupTrigger<TInput = unknown, TOutput = unknown>({
  name,
  singletonServices,
  input,
  onTrigger,
}: SetupTriggerParams<TInput, TOutput>): Promise<TriggerInstance> {
  const trigger = pikkuState(null, 'trigger', 'triggers').get(name)
  const meta = pikkuState(null, 'trigger', 'meta')[name]

  if (!trigger) {
    throw new Error(`Trigger not found: ${name}`)
  }
  if (!meta) {
    throw new Error(`Trigger metadata not found: ${name}`)
  }

  const wire = {
    trigger: {
      invoke: (data: TOutput) => {
        singletonServices.logger.info(`Trigger fired: ${name}`)
        onTrigger(data)
      },
    },
  }

  singletonServices.logger.info(`Setting up trigger: ${name}`)

  const teardown = await trigger.func.func(
    singletonServices,
    input,
    wire as any
  )

  return {
    name,
    teardown,
  }
}

/**
 * Gets all registered triggers
 */
export const getRegisteredTriggers = () => {
  return pikkuState(null, 'trigger', 'triggers')
}

/**
 * Gets trigger metadata
 */
export const getTriggerMeta = () => {
  return pikkuState(null, 'trigger', 'meta')
}
