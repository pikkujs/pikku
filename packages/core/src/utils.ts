import { Logger } from './services/logger.js'
import { CoreSingletonServices, WireServices } from './types/core.types.js'

export const closeWireServices = async (
  logger: Logger,
  wireServices: WireServices
) => {
  await Promise.all(
    Object.values(wireServices).map(async (service: any) => {
      if (service?.close) {
        try {
          await service.close()
        } catch (e: any) {
          logger.error(e)
        }
      }
    })
  )
}

export const createWeakUID = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10)
}

export const isSerializable = (data: any): boolean => {
  return !(
    typeof data === 'string' ||
    data instanceof ArrayBuffer ||
    data instanceof Uint8Array ||
    data instanceof Int8Array ||
    data instanceof Uint16Array ||
    data instanceof Int16Array ||
    data instanceof Uint32Array ||
    data instanceof Int32Array ||
    data instanceof Float32Array ||
    data instanceof Float64Array
  )
}

export const getTagGroups = <T>(
  tagGroups: Record<string, T>,
  tag: string
): T[] => {
  const results: T[] = []
  const exact = tagGroups[tag]
  if (exact) results.push(exact)
  let colonIdx = tag.lastIndexOf(':')
  while (colonIdx !== -1) {
    const parent = tag.slice(0, colonIdx)
    const group = tagGroups[parent]
    if (group) results.push(group)
    colonIdx = parent.lastIndexOf(':')
  }
  return results
}

const EMPTY_ARRAY = Object.freeze([])

export const freezeDedupe = <T>(
  arr?: readonly T[] | T[] | undefined
): readonly T[] => {
  if (!arr || arr.length === 0) return EMPTY_ARRAY
  if (arr.length === 1) return Object.freeze([arr[0]!])
  const seen = new Set<T>()
  const out: T[] = []
  for (let i = 0; i < arr.length; i++) {
    const fn = arr[i]!
    if (!seen.has(fn)) {
      seen.add(fn)
      out.push(fn)
    }
  }
  return Object.freeze(out)
}

/**
 * Stop a single service by calling its stop method if it exists
 */
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
 * Stop all singleton services, including external package services.
 * External package services are stopped first, then the parent services.
 *
 * @param singletonServices - The parent singleton services to stop
 */
export const stopSingletonServices = async (
  singletonServices: CoreSingletonServices
): Promise<void> => {
  const logger = singletonServices.logger

  // First, stop all external package singleton services
  if (globalThis.pikkuState) {
    for (const [packageName, packageState] of globalThis.pikkuState) {
      // Skip main package - we handle it separately
      if (packageName === '__main__') continue

      const packageServices = packageState.package?.singletonServices
      if (packageServices) {
        logger.info(`Stopping singleton services for package: ${packageName}`)
        for (const [name, service] of Object.entries(packageServices)) {
          await stopService(logger, `${packageName}/${name}`, service)
        }
        // Clear the cached services
        packageState.package.singletonServices = null
      }
    }
  }

  // Then stop the parent singleton services
  for (const [name, service] of Object.entries(singletonServices)) {
    await stopService(logger, name, service)
  }
}
