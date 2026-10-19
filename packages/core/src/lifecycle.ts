import type { Logger } from './services/logger.js'
import type {
  CoreSingletonServices,
  ServerLifecycle,
} from './types/core.types.js'
import { getSingletonServices, getAllPackageStates } from './pikku-state.js'

const stopService = async (
  logger: Logger,
  name: string,
  service: any
): Promise<void> => {
  const stop = service?.stop
  if (stop) {
    logger.info(`Stopping singleton service: ${name}`)
    try {
      await stop.call(service)
    } catch (e: any) {
      logger.error(`Error stopping service ${name}:`, e)
    }
  }
}

/** Stops addon package services first, then the parent singleton services. */
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
        for (const [name, service] of Object.entries(packageServices)) {
          await stopService(logger, `${packageName}/${name}`, service)
        }
        packageState.package.singletonServices = null
      }
    }
  }

  for (const [name, service] of Object.entries(singletonServices)) {
    await stopService(logger, name, service)
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

/** A contributor's `onServerStart` / `onServerStop`, as the generated platform-services file lists it. */
export interface ContributorServerHook {
  name: string
  run: (services: any) => void | Promise<void>
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Composes the server lifecycle around the app's own: contributor start hooks
 * run first, in order, then the app's `beforeStart`; the app's `afterStart` and
 * `beforeStop` are unchanged; after the app's `afterStop` the stop hooks run
 * (already in reverse run order, as the generated file lists them).
 *
 * A start hook that throws aborts startup with an error naming the contributor.
 * Every stop hook is attempted even if an earlier one (or the app's
 * `afterStop`) threw; the failures are then thrown together, each named.
 */
export const composeServerLifecycle = <
  SS extends CoreSingletonServices = CoreSingletonServices,
>(
  app: ServerLifecycle<SS> | undefined,
  hooks: {
    start?: readonly ContributorServerHook[]
    stop?: readonly ContributorServerHook[]
  }
): ServerLifecycle<SS> => ({
  beforeStart: async (services) => {
    for (const hook of hooks.start ?? []) {
      try {
        await hook.run(services)
      } catch (error) {
        throw new Error(
          `Contributor '${hook.name}' failed in onServerStart: ${describeError(error)}`,
          { cause: error }
        )
      }
    }
    await app?.beforeStart?.(services)
  },
  afterStart: (services) => app?.afterStart?.(services),
  beforeStop: (services) => app?.beforeStop?.(services),
  afterStop: async (services) => {
    const failures: string[] = []
    const errors: unknown[] = []
    let hookFailed = false
    try {
      await app?.afterStop?.(services)
    } catch (error) {
      failures.push(`the app's afterStop: ${describeError(error)}`)
      errors.push(error)
    }
    for (const hook of hooks.stop ?? []) {
      try {
        await hook.run(services)
      } catch (error) {
        hookFailed = true
        failures.push(
          `contributor '${hook.name}' onServerStop: ${describeError(error)}`
        )
        errors.push(error)
      }
    }
    if (errors.length === 1 && failures.length === 1 && !hookFailed) {
      throw errors[0]
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `Server stop failed: ${failures.join('; ')}`
      )
    }
  },
})
