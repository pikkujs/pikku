import type { Logger } from './services/logger.js'
import type { WireServices } from './types/core.types.js'
import { BadRequestError } from './errors/errors.js'

/**
 * Calls `close()` on every wire service that has one, in parallel, at the end of a
 * wiring. A failing `close` is logged and does not stop the others.
 */
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
/**
 * A process-unique id (random 8-character prefix plus a counter). Not
 * unpredictable, so never use it as a token or secret.
 */
export const createWeakUID = () => {
  _uidPrefix ??= globalThis.crypto.randomUUID().slice(0, 8)
  return `${_uidPrefix}-${++_uidCounter}`
}

/**
 * Whether a response body needs `JSON.stringify`: false for strings and binary
 * (`ArrayBuffer` and typed arrays), which are sent as they are.
 */
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

/**
 * Looks up the groups for a hierarchical tag and each of its `:`-separated
 * ancestors, most specific first: `'admin:users'` yields the groups for
 * `'admin:users'` then `'admin'`.
 */
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

/**
 * `JSON.parse` of text or UTF-8 bytes, refusing anything that is not JSON with
 * a 400 rather than a 500.
 *
 * @example snippet: pikkuWebhookReceive
 */
export const parseJson = <T = any>(input: string | Uint8Array): T => {
  const text =
    typeof input === 'string' ? input : new TextDecoder().decode(input)
  try {
    return JSON.parse(text)
  } catch {
    throw new BadRequestError('Body is not valid JSON')
  }
}

const EMPTY_ARRAY = Object.freeze([])

/**
 * Returns a frozen copy of the array with duplicates removed, keeping first-seen
 * order. Used for middleware and permission lists, so the same function is never
 * run twice.
 */
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

export { stopSingletonServices, pikkuServerLifecycle } from './lifecycle.js'

/** `T` with the keys `K` made required. */
export type MakeRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>

/** A JSON scalar; `undefined` is included because it is dropped on serialisation rather than rejected. */
export type JSONPrimitive = string | number | boolean | null | undefined

/** Any value that round-trips through JSON. */
export type JSONValue =
  | JSONPrimitive
  | JSONValue[]
  | {
      [key: string]: JSONValue
    }

/** `T` with the keys `K` made required and every other key unchanged. */
export type PickRequired<T, K extends keyof T> = T & Required<Pick<T, K>>

/** `T` with every key optional except `K`. */
export type PickOptional<T, K extends keyof T> = Partial<T> & Pick<T, K>

/** `T` with every key optional, but at least one of them present. */
export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>
}[keyof T]

export {
  getDurationInMilliseconds,
  getRelativeTimeOffset,
  getRelativeTimeOffsetFromNow,
  parseDurationString,
} from './time-utils.js'
export type { RelativeTimeInput } from './time-utils.js'

export {
  formatVersionedId,
  isVersionedId,
  parseVersionedId,
} from './version.js'
