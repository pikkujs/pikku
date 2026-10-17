import type { PikkuRawWire } from '../../types/core.types.js'
import type {
  CoreTrigger,
  CoreTriggerSource,
  TriggerInstance,
  TriggerInvokeOptions,
} from './trigger.types.js'
import {
  pikkuState,
  getSingletonServices,
  getCreateWireServices,
} from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import { PikkuMissingMetaError } from '../../errors/errors.js'

/**
 * Registers a trigger: the function that runs each time a trigger source of the
 * same `name` fires. The source is wired separately with
 * {@link wireTriggerSource} (or {@link wireTriggerWebhookSource}).
 *
 * Skipped with a warning when `pikku all` generated no metadata for it, which
 * usually means the wiring shares a file with the function it wires.
 *
 * @param trigger - The trigger's name and the function it runs.
 *
 * @example snippet: wireTrigger
 */
export const wireTrigger = (trigger: CoreTrigger) => {
  const meta = pikkuState(null, 'trigger', 'meta')
  const triggerMeta = meta[trigger.name]
  if (!triggerMeta) {
    console.warn(
      `[pikku] Skipping trigger '${trigger.name}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }

  addFunction(triggerMeta.pikkuFuncId, trigger.func)

  const triggers = pikkuState(null, 'trigger', 'triggers')
  triggers.set(trigger.name, trigger)
}

// knowledge: decisions/internals/trigger-declaration-is-split-from-trigger-source.md
/**
 * Registers a trigger source: a long-lived function that subscribes to something
 * outside the app and calls `wire.trigger.invoke(data)` whenever it fires, and
 * returns its teardown. Its `name` must match a {@link wireTrigger}.
 *
 * The source and the triggers it fires run with no user session, so whatever
 * the source pushes reaches them as untrusted input.
 *
 * @param source - The source's name, the function that sets it up, and its input.
 * @throws Error when a source with the same name is already registered.
 *
 * @example snippet: wireTriggerSource
 */
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
  // knowledge: decisions/internals/wiring-registries-erase-the-generics-their-wire-functions-capture.md
  triggerSources.set(source.name, source as CoreTriggerSource)

  addFunction(
    triggerSourceMeta.pikkuFuncId,
    source.func as CorePikkuFunctionConfig<any, any>,
    triggerSourceMeta.packageName
  )
}

export type SetupTriggerParams<TInput = unknown, TOutput = unknown> = {
  name: string
  input?: TInput
  onTrigger: (
    data: TOutput,
    options?: TriggerInvokeOptions
  ) => void | Promise<void>
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
      invoke: (data: unknown, options?: TriggerInvokeOptions) => {
        const pikkuUserId = options?.pikkuUserId
        if (
          pikkuUserId !== undefined &&
          (typeof pikkuUserId !== 'string' || pikkuUserId === '')
        ) {
          // Running it as nobody would hide the source's bug, and as anyone
          // else is not possible: the event is dropped.
          singletonServices.logger.error(
            `Trigger '${name}' fired with an invalid pikkuUserId; dropping the event`
          )
          return
        }
        singletonServices.logger.info(`Trigger fired: ${name}`)
        // `invoke` is typed void for trigger sources, so a rejection from the
        // trigger function is logged here rather than left unhandled.
        Promise.resolve(
          onTrigger(data as TOutput, pikkuUserId ? { pikkuUserId } : undefined)
        ).catch((e) =>
          singletonServices.logger.error(
            `Trigger '${name}' handler failed: ${e?.message ?? e}`
          )
        )
      },
    },
  }

  singletonServices.logger.info(`Setting up trigger: ${name}`)

  const teardown = await runPikkuFunc('trigger', name, sourceMeta.pikkuFuncId, {
    singletonServices,
    createWireServices,
    auth: false,
    data: () => input,
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
