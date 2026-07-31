import type { PikkuRawWire } from '../../types/core.types.js'
import type {
  CoreTrigger,
  CoreTriggerSource,
  TriggerInstance,
} from './trigger.types.js'
import {
  pikkuState,
  getSingletonServices,
  getCreateWireServices,
} from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { PikkuMissingMetaError } from '../../errors/errors.js'

export const wireTrigger = (trigger: CoreTrigger) => {
  const meta = pikkuState(null, 'trigger', 'meta')
  const triggerMeta = meta[trigger.name]
  if (!triggerMeta) {
    console.warn(
      `[pikku] Skipping trigger '${trigger.name}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }

  addFunction(triggerMeta.pikkuFuncId, trigger.func as any)

  const triggers = pikkuState(null, 'trigger', 'triggers')
  triggers.set(trigger.name, trigger as any)
}

// knowledge: decisions/design/trigger-declaration-is-split-from-trigger-source.md
export const wireTriggerSource = <TInput = unknown, TOutput = unknown>(
  source: CoreTriggerSource<TInput, TOutput>
) => {
  const sourceMeta = pikkuState(null, 'trigger', 'sourceMeta')
  const triggerSourceMeta = sourceMeta[source.name]
  if (!triggerSourceMeta) {
    console.warn(
      `[pikku] Skipping trigger source '${source.name}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
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

export type SetupTriggerParams<TInput = unknown, TOutput = unknown> = {
  name: string
  input?: TInput
  onTrigger: (data: TOutput) => void | Promise<void>
}

export async function setupTrigger<TInput = unknown, TOutput = unknown>({
  name,
  input,
  onTrigger,
}: SetupTriggerParams<TInput, TOutput>): Promise<TriggerInstance> {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()
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

  const wire: PikkuRawWire = {
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

export const getRegisteredTriggers = () => {
  return pikkuState(null, 'trigger', 'triggers')
}

export const getTriggerMeta = () => {
  return pikkuState(null, 'trigger', 'meta')
}
