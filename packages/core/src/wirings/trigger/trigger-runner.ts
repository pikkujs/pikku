import type { CoreSingletonServices } from '../../types/core.types.js'
import type {
  CoreTrigger,
  TriggerInstance,
  CorePikkuTriggerFunctionConfig,
} from './trigger.types.js'
import { pikkuState } from '../../pikku-state.js'

/**
 * Adds a trigger function to the registry.
 * Similar to addFunction but for trigger-specific functions.
 */
export const addTrigger = (
  triggerName: string,
  funcConfig: CorePikkuTriggerFunctionConfig<any, any>,
  packageName: string | null = null
) => {
  pikkuState(packageName, 'trigger', 'functions').set(triggerName, funcConfig)
}

/**
 * Registers a trigger with the Pikku framework.
 * The trigger will be available for setup via setupTrigger.
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

  const triggers = pikkuState(null, 'trigger', 'triggers')
  if (triggers.has(trigger.name)) {
    throw new Error(`Trigger already exists: ${trigger.name}`)
  }
  triggers.set(trigger.name, trigger as any)
}

/**
 * Parameters for setting up a trigger
 */
export type SetupTriggerParams<TOutput = unknown> = {
  name: string
  singletonServices: CoreSingletonServices
  onTrigger: (data: TOutput) => void | Promise<void>
}

/**
 * Sets up a registered trigger and starts listening for events.
 * Returns a TriggerInstance with a teardown function.
 */
export async function setupTrigger<TOutput = unknown>({
  name,
  singletonServices,
  onTrigger,
}: SetupTriggerParams<TOutput>): Promise<TriggerInstance> {
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
    trigger.input,
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
