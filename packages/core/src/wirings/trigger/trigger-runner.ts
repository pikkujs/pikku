import type { PikkuWire, CreateWireServices } from '../../types/core.types.js'
import { type CoreSingletonServices } from '../../types/core.types.js'
import type {
  CoreTrigger,
  CoreTriggerSource,
  TriggerInstance,
} from './trigger.types.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { PikkuMissingMetaError } from '../../errors/errors.js'

/**
 * Registers a trigger with the Pikku framework.
 * Declares a trigger name and its target pikku function.
 * Runs everywhere. Inspector extracts at build time.
 */
export const wireTrigger = (trigger: CoreTrigger) => {
  const meta = pikkuState(null, 'trigger', 'meta')
  const triggerMeta = meta[trigger.name]
  if (!triggerMeta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for trigger '${trigger.name}'`
    )
  }

  addFunction(triggerMeta.pikkuFuncId, trigger.func as any)

  const triggers = pikkuState(null, 'trigger', 'triggers')
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
  const sourceMeta = pikkuState(null, 'trigger', 'sourceMeta')
  const triggerSourceMeta = sourceMeta[source.name]
  if (!triggerSourceMeta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for trigger source '${source.name}'`
    )
  }

  const triggerSources = pikkuState(null, 'trigger', 'triggerSources')
  if (triggerSources.has(source.name)) {
    throw new Error(`Trigger source already exists: ${source.name}`)
  }
  triggerSources.set(source.name, source as any)

  addFunction(
    triggerSourceMeta.pikkuFuncId,
    source.func as any,
    triggerSourceMeta.packageName
  )
}

/**
 * Parameters for setting up a trigger
 */
export type SetupTriggerParams<TInput = unknown, TOutput = unknown> = {
  name: string
  singletonServices: CoreSingletonServices
  createWireServices?: CreateWireServices
  input?: TInput
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
  createWireServices,
  input,
  onTrigger,
}: SetupTriggerParams<TInput, TOutput>): Promise<TriggerInstance> {
  const source = pikkuState(null, 'trigger', 'triggerSources').get(name)
  const sourceMeta = pikkuState(null, 'trigger', 'sourceMeta')[name]

  if (!source) {
    throw new Error(`Trigger source not found: ${name}`)
  }
  if (!sourceMeta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for trigger source '${name}'`
    )
  }

  const wire: PikkuWire = {
    trigger: {
      invoke: (data: unknown) => {
        singletonServices.logger.info(`Trigger fired: ${name}`)
        onTrigger(data as TOutput)
      },
    },
  }

  singletonServices.logger.info(`Setting up trigger: ${name}`)

  const teardown = await runPikkuFunc('trigger', name, sourceMeta.pikkuFuncId, {
    singletonServices,
    createWireServices,
    auth: false,
    data: () => input as any,
    wire,
    packageName: sourceMeta.packageName || null,
  })

  return { name, teardown }
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
