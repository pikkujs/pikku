import type { SpanAttributeValue } from '../tracer.js'
import type { OtlpAttributes } from './otlp-types.js'

/**
 * GreptimeDB turns every span attribute into a typed column and rejects a batch
 * in which a key changes type. The allow-list fixes each key's type, so the
 * exporter starts from it: a column created by one process is never contradicted
 * by the next, whatever value arrives first.
 */
export type AttributeKind = 'string' | 'int' | 'double' | 'bool'

const ALLOW_LIST_KINDS: Record<string, AttributeKind> = {
  'pikku.wire.type': 'string',
  'pikku.wire.id': 'string',
  'pikku.function.id': 'string',
  'pikku.package': 'string',
  'pikku.addon.namespace': 'string',
  'pikku.trace.root': 'bool',
  'pikku.function.duration_ms': 'int',
  'pikku.user.id': 'string',
  'pikku.org.id': 'string',
  'http.request.method': 'string',
  'http.route': 'string',
  'http.response.status_code': 'int',
  'pikku.queue.name': 'string',
  'pikku.queue.job_id': 'string',
  'pikku.scheduler.task': 'string',
  'pikku.workflow.name': 'string',
  'pikku.workflow.run_id': 'string',
  'pikku.workflow.step': 'string',
  'pikku.channel.id': 'string',
  'pikku.mcp.tool': 'string',
  'messaging.system': 'string',
  'messaging.destination.name': 'string',
  'rpc.service': 'string',
  'db.system': 'string',
  'db.operation.name': 'string',
  'db.collection.name': 'string',
  'db.query.text': 'string',
}

/**
 * Key prefixes a plugin owns. A key under one is kept even when it is not
 * listed, with the type it was first seen with: the Kysely plugin's `db.*`
 * family is open-ended (`db.namespace`, and whatever a dialect adds). Every other
 * key must be in the list above.
 */
const PLUGIN_PREFIXES = ['db.']

/** The only attributes a span event may carry: the redacted class and message of an error. */
const EVENT_ATTRIBUTE_KEYS = ['exception.type', 'exception.message']

/** An event name is a short dotted identifier; anything else is data. */
const EVENT_NAME = /^[a-z][a-z0-9_.]{0,63}$/

/** More distinct keys than this in one process means keys built from data. */
const MAX_KEYS = 512

const kindOf = (value: SpanAttributeValue): AttributeKind | undefined => {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'bool'
  if (!Number.isFinite(value)) return undefined
  return Number.isSafeInteger(value) ? 'int' : 'double'
}

/**
 * Remembers the first type each key was sent with and coerces later values to
 * it: a whole number into a double column, anything into a string column, a
 * double into an int column by rounding. A value that cannot be coerced without
 * inventing data (a string into a number, anything into a bool) is dropped, and
 * counted, rather than risking the whole batch.
 *
 * Fail closed: a key that is neither allow-listed nor under a plugin prefix is
 * dropped and counted, so nothing a caller invents reaches the store.
 *
 * knowledge: decisions/internals/a-spans-attributes-are-an-allow-list.md
 */
export class AttributeTypes {
  private readonly kinds = new Map<string, AttributeKind>(
    Object.entries(ALLOW_LIST_KINDS)
  )
  /** Values dropped because they could not take their key's type. */
  dropped = 0

  coerce(attributes: Record<string, SpanAttributeValue>): OtlpAttributes {
    const out: OtlpAttributes = {}
    for (const [key, value] of Object.entries(attributes)) {
      const kind = kindOf(value)
      if (!kind) {
        this.dropped++
        continue
      }
      let expected = this.kinds.get(key)
      if (!expected) {
        if (!PLUGIN_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          this.dropped++
          continue
        }
        if (this.kinds.size >= MAX_KEYS) {
          this.dropped++
          continue
        }
        this.kinds.set(key, kind)
        expected = kind
      }
      const coerced = this.to(expected, kind, value)
      if (coerced === undefined) this.dropped++
      else out[key] = coerced
    }
    return out
  }

  /**
   * `events` with only what an event may carry: an event whose name is not a
   * short identifier is dropped whole, and an attribute other than
   * `exception.type` and `exception.message` is dropped. Each drop is counted.
   */
  events<
    E extends { name: string; attributes?: Record<string, SpanAttributeValue> },
  >(events: readonly E[]): E[] {
    const out: E[] = []
    for (const event of events) {
      if (!EVENT_NAME.test(event.name)) {
        this.dropped++
        continue
      }
      const kept: Record<string, SpanAttributeValue> = {}
      for (const [key, value] of Object.entries(event.attributes ?? {})) {
        if (EVENT_ATTRIBUTE_KEYS.includes(key) && typeof value === 'string')
          kept[key] = value
        else this.dropped++
      }
      out.push({ ...event, attributes: kept })
    }
    return out
  }

  private to(
    expected: AttributeKind,
    actual: AttributeKind,
    value: SpanAttributeValue
  ): OtlpAttributes[string] | undefined {
    if (expected === 'string') return String(value)
    if (expected === 'bool') return actual === 'bool' ? value : undefined
    if (typeof value !== 'number') return undefined
    if (expected === 'double') return { double: value }
    // expected int
    const rounded = Math.round(value)
    return Number.isSafeInteger(rounded) ? rounded : undefined
  }
}
