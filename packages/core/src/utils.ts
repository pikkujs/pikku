import { Logger } from './services/logger.js'

// TODO: SessionServices probably needs it's own type
// but is an issue for the future and will be tackled
// with dependency injection
export const closeSessionServices = async (
  logger: Logger,
  sessionServices: Record<string, any>
) => {
  await Promise.all(
    Object.values(sessionServices).map(async (service) => {
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
