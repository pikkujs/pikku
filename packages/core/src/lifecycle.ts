import type { Logger } from './services/logger.js'
import type {
  CoreSingletonServices,
  ServerLifecycle,
} from './types/core.types.js'
import { getSingletonServices, getAllPackageStates } from './pikku-state.js'
import { ProviderError } from './provider/provider-error.js'
import { readHeldKeys, readStopOrder } from './provider/stop-order.js'

const stopService = async (
  logger: Logger,
  name: string,
  service: any,
  stopped?: WeakSet<object>
): Promise<void> => {
  const stop = service?.stop
  if (stop) {
    if (stopped && typeof service === 'object') {
      if (stopped.has(service)) return
      stopped.add(service)
    }
    logger.info(`Stopping singleton service: ${name}`)
    try {
      await stop.call(service)
    } catch (e: any) {
      logger.error(`Error stopping service ${name}:`, e)
    }
  }
}

/**
 * Stops addon package services first, then the parent singleton services.
 * Addon package services stop in reverse of the order they were built. The
 * parent's stop in the order the provider runner recorded (latest provider
 * first, a collection's items each in their place), then the rest in reverse insertion order. An object held under two
 * keys is stopped once.
 */
export const stopSingletonServices = async (): Promise<void> => {
  const singletonServices = getSingletonServices()
  const logger = singletonServices.logger

  const stateMap = getAllPackageStates()
  if (stateMap.size > 0) {
    for (const [packageName, packageState] of stateMap) {
      if (packageName === '__main__') continue

      const packageServices = packageState.package?.singletonServices
      if (packageServices) {
        logger.info(`Stopping singleton services for package: ${packageName}`)
        for (const [name, service] of Object.entries(
          packageServices
        ).reverse()) {
          await stopService(logger, `${packageName}/${name}`, service)
        }
        packageState.package.singletonServices = null
      }
    }
  }

  const stopped = new WeakSet<object>()
  const held = new Map(Object.entries(singletonServices))
  const handled = new Set<string>()
  const runnerHeld = readHeldKeys()
  if (runnerHeld) {
    const heldByRunner = new Set(runnerHeld)
    for (const [name, service] of [...held].reverse()) {
      if (heldByRunner.has(name)) continue
      handled.add(name)
      await stopService(logger, name, service, stopped)
    }
  }
  for (const entry of readStopOrder()) {
    if (typeof entry !== 'string') {
      const items = held.get(entry.collection)
      const found = Array.isArray(items)
        ? items.find((candidate) => candidate?.label === entry.label)
        : undefined
      await stopService(
        logger,
        `${entry.collection}/${entry.label}`,
        found?.item,
        stopped
      )
      continue
    }
    if (!held.has(entry)) continue
    handled.add(entry)
    await stopService(logger, entry, held.get(entry), stopped)
  }
  for (const [name, service] of [...held].reverse()) {
    if (handled.has(name)) continue
    await stopService(logger, name, service, stopped)
  }
}

/**
 * Wrap server lifecycle hooks so the inspector can discover them.
 *
 * @example snippet: serverLifecycle
 */
export const pikkuServerLifecycle = <
  SS extends CoreSingletonServices = CoreSingletonServices,
>(
  lifecycle: ServerLifecycle<SS>
): ServerLifecycle<SS> => lifecycle

/**
 * Calls `run` once when the process receives one of `signals` (default
 * `SIGINT` and `SIGTERM`); later signals are ignored while it runs. Does
 * nothing outside Node-like runtimes. It does not exit the process.
 *
 * @returns A function that removes the handlers.
 */
export const onShutdownSignals = (
  run: (signal: NodeJS.Signals) => void | Promise<void>,
  signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
): (() => void) => {
  const proc = typeof process !== 'undefined' ? process : undefined
  if (!proc?.on) return () => {}
  let stopping = false
  const handlers = signals.map((signal) => {
    const handler = () => {
      if (stopping) return
      stopping = true
      void run(signal)
    }
    proc.on(signal, handler)
    return [signal, handler] as const
  })
  return () => {
    for (const [signal, handler] of handlers) proc.off(signal, handler)
  }
}

/** A service's `onServerStart`, as the generated server entry lists it. */
export interface ServiceServerHook {
  name: string
  run: (services: any) => void | Promise<void>
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Composes the server lifecycle around the app's own: service start hooks
 * run first, in order, then the app's `beforeStart`; the app's `afterStart`,
 * `beforeStop` and `afterStop` are unchanged.
 *
 * A start hook that throws aborts startup with an error naming the service.
 */
export const composeServerLifecycle = <
  SS extends CoreSingletonServices = CoreSingletonServices,
>(
  app: ServerLifecycle<SS> | undefined,
  hooks: {
    start?: readonly ServiceServerHook[]
  }
): ServerLifecycle<SS> => ({
  beforeStart: async (services) => {
    for (const hook of hooks.start ?? []) {
      try {
        await hook.run(services)
      } catch (error) {
        throw new ProviderError(
          'start-failed',
          `Provider '${hook.name}' failed in onServerStart: ${describeError(error)}`,
          { cause: error }
        )
      }
    }
    await app?.beforeStart?.(services)
  },
  afterStart: (services) => app?.afterStart?.(services),
  beforeStop: (services) => app?.beforeStop?.(services),
  afterStop: (services) => app?.afterStop?.(services),
})
