import type { FinishedSpan } from '../../tracer.js'
import { isAllowedAttributeKey } from '../attribute-types.js'
import type { Attrs, RunOutcome, SpanFrameStart, SpanRole } from './types.js'

/** Unix nanoseconds to whole milliseconds, half up. */
export const nsToMs = (ns: bigint): number =>
  Number((ns + 500_000n) / 1_000_000n)

/** A duration in ms with microsecond resolution, from the exact ns difference. */
export const durationMsOf = (startNs: bigint, endNs: bigint): number =>
  endNs > startNs ? Math.round(Number(endNs - startNs) / 1000) / 1000 : 0

/** The longest span name, function id or error name kept; a longer one is cut, as attribute values are. */
export const MAX_NAME_LENGTH = 256

/** A string cut to {@link MAX_NAME_LENGTH}, so a name built from data cannot grow an event, a view or a health key. */
export const cutName = (value: string): string =>
  value.length > MAX_NAME_LENGTH ? value.slice(0, MAX_NAME_LENGTH) : value

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? cutName(value) : undefined

/** Error class names that mean the caller was refused, not that the code broke. */
const DENIED_ERRORS = new Set([
  'ForbiddenError',
  'UnauthorizedError',
  'MissingSessionError',
  'InvalidSessionError',
  'MissingScopeError',
  'ReadonlySessionError',
  'InvalidOriginError',
  'MissingCredentialError',
  'CredentialRejectedError',
])

/** The function a span is about; an addon's function is `<namespace>:<id>`. */
export const functionIdOf = (
  span: Pick<SpanFrameStart, 'attributes'>
): string | undefined => {
  const id = str(span.attributes['pikku.function.id'])
  if (!id) return undefined
  const namespace = str(span.attributes['pikku.addon.namespace'])
  return namespace && !id.startsWith(`${namespace}:`)
    ? cutName(`${namespace}:${id}`)
    : id
}

/** The error class of a failed span: its `exception` event, else the class part of the status message. */
export const errorNameOf = (
  span: Pick<FinishedSpan, 'status' | 'events'>
): string | null => {
  for (const event of span.events ?? []) {
    if (event.name === 'exception') {
      const type = str(event.attributes?.['exception.type'])
      if (type) return type
    }
  }
  if (span.status.code !== 'error') return null
  return str(span.status.message?.split(':')[0]?.trim()) ?? 'Error'
}

/** `denied` is a guess from the error class or an HTTP 401/403: spans carry no denial signal. */
export const outcomeOf = (
  span: Pick<FinishedSpan, 'status' | 'events' | 'attributes'>
): RunOutcome => {
  if (span.status.code !== 'error') return 'ok'
  const status = span.attributes['http.response.status_code']
  if (status === 401 || status === 403) return 'denied'
  const name = errorNameOf(span)
  return name && DENIED_ERRORS.has(name) ? 'denied' : 'error'
}

/** The longest attribute key kept; a longer one is dropped. */
export const MAX_ATTR_KEY_LENGTH = 128
/** The most attributes a view or an event carries. */
export const MAX_ATTRS = 64
/** The longest string value kept; a longer one is cut. */
export const MAX_ATTR_VALUE_LENGTH = 256

/**
 * A bounded, JSON-safe copy of a span's attributes, default-deny: only keys the OTLP exporter lets out
 * (`isAllowedAttributeKey`: its allow-list and the `db.` plugin prefix) are kept, so a custom attribute never reaches
 * a browser. `pikku.*` keys come first, so the {@link MAX_ATTRS} cap can never drop `pikku.wire.type` or
 * `pikku.user.id` for the open-ended `db.*` family. Keys over {@link MAX_ATTR_KEY_LENGTH} and non-finite numbers
 * (JSON would turn them into null) are dropped, strings cut to {@link MAX_ATTR_VALUE_LENGTH}. Events and views both
 * carry this, so a snapshot holds what the stream holds.
 */
export const boundAttrs = (attributes: Attrs): Attrs => {
  const out: Attrs = {}
  let count = 0
  const keys = Object.keys(attributes)
  const ordered = [
    ...keys.filter((key) => key.startsWith('pikku.')),
    ...keys.filter((key) => !key.startsWith('pikku.')),
  ]
  for (const key of ordered) {
    if (count >= MAX_ATTRS) break
    if (key.length > MAX_ATTR_KEY_LENGTH || !isAllowedAttributeKey(key))
      continue
    const value = attributes[key]
    if (typeof value === 'string') {
      out[key] =
        value.length > MAX_ATTR_VALUE_LENGTH
          ? value.slice(0, MAX_ATTR_VALUE_LENGTH)
          : value
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue
      out[key] = value
    } else if (typeof value === 'boolean') {
      out[key] = value
    } else continue
    count++
  }
  return out
}

/**
 * Database spans are `db`. A `producer` span (a queue publish, a schedule, a webhook send) has no function of its own:
 * the consumer that picks the job up is the hop, so the producer is a `boundary` and its children hang off the nearest
 * hop. Everything else is a `hop`.
 */
export const defaultClassify = (span: SpanFrameStart): SpanRole =>
  span.attributes['db.system'] !== undefined
    ? 'db'
    : span.kind === 'producer'
      ? 'boundary'
      : 'hop'
