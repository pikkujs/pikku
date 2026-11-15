import type { FinishedSpan } from '../../tracer.js'
import type { DbSummary } from './types.js'

const MAX_OPS = 50
const MAX_TEXTS = 50

/** Folds the db spans under one hop into a {@link DbSummary}. */
export class DbAccumulator {
  private count = 0
  private totalNs = 0n
  private readonly byOp = new Map<string, number>()
  private readonly texts = new Map<string, number>()
  private sawText = false
  private repeated = 0

  add(span: FinishedSpan): void {
    this.count++
    if (span.endTimeUnixNano > span.startTimeUnixNano) {
      this.totalNs += span.endTimeUnixNano - span.startTimeUnixNano
    }
    const operation = String(span.attributes['db.operation.name'] ?? 'other')
    const collection = span.attributes['db.collection.name']
    let key =
      collection === undefined ? operation : `${operation} ${collection}`
    if (!this.byOp.has(key) && this.byOp.size >= MAX_OPS) key = 'other'
    this.byOp.set(key, (this.byOp.get(key) ?? 0) + 1)

    const text = span.attributes['db.query.text']
    if (typeof text === 'string' && text) {
      this.sawText = true
      const seen = this.texts.get(text)
      if (seen !== undefined) {
        this.texts.set(text, seen + 1)
        this.repeated++
      } else if (this.texts.size < MAX_TEXTS) {
        this.texts.set(text, 1)
      }
    }
  }

  get size(): number {
    return this.count
  }

  summary(): DbSummary {
    return {
      count: this.count,
      totalMs: Math.round(Number(this.totalNs) / 1000) / 1000,
      byOp: Object.fromEntries(this.byOp),
      ...(this.sawText ? { repeated: this.repeated } : {}),
    }
  }
}
