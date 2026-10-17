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
