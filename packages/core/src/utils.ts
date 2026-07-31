import type { Logger } from './services/logger.js'
import type {
  CoreSingletonServices,
  ServerLifecycle,
  WireServices,
} from './types/core.types.js'
import { getSingletonServices, getAllPackageStates } from './pikku-state.js'

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

let _uidPrefix: string | undefined
let _uidCounter = 0
export const createWeakUID = () => {
  _uidPrefix ??= globalThis.crypto.randomUUID().slice(0, 8)
  return `${_uidPrefix}-${++_uidCounter}`
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

/** Wrap server lifecycle hooks so the inspector can discover them. */
export const pikkuServerLifecycle = <
  SS extends CoreSingletonServices = CoreSingletonServices,
>(
  lifecycle: ServerLifecycle<SS>
): ServerLifecycle<SS> => lifecycle
