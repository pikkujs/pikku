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

/**
 * Stops addon package services first, then the parent singleton services.
 * Within each group services stop in reverse of the order they were built.
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

  for (const [name, service] of Object.entries(singletonServices).reverse()) {
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

/** What a host's platform services are told about what they are built for. */
export interface PlatformServicesContext {
  /** The services the deployed unit, or the local server, reaches. */
  requiredServices: readonly string[]
}

/**
 * Types the `createPlatformServices` of a host's platform services module: the
 * one a deploy provider names with `platformServicesModule`, or the host passes
 * as `--platform-services`. It receives the environment and the services built so
 * far, and returns only the services it adds or replaces.
 *
 * @example snippet: platformServices
 */
export const pikkuPlatformServices = <
  Services extends Record<string, any> = CoreSingletonServices,
  Env = Record<string, string | undefined>,
>(
  create: (
    env: Env,
    services: Partial<Services>,
    context: PlatformServicesContext
  ) => Partial<Services> | Promise<Partial<Services>>
) => create

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
