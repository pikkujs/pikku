import type { HealthEntry, RunOutcome } from './types.js'

const MAX_KEYS = 2000
const MAX_SAMPLES = 1000

interface Sample {
  at: number
  ms: number
  outcome: RunOutcome
}

/**
 * Per-key counts over a sliding window. Bounded: at most 2000 keys (the least recently recorded goes first) and 1000
 * samples a key (the oldest by `at` goes first), so `runs` of a very busy key is capped at 1000.
 *
 * One clock domain: a sample's `at` is the span's end time, and `entries(nowMs)` compares it with the caller's
 * `nowMs`. Both must be unix milliseconds on the same clock (live: the wall clock; replay: the replayed span time).
 * Samples may arrive in any order: each list is kept sorted by `at`, so pruning the window is a prefix cut. A sample
 * after `nowMs` is not counted until the clock reaches it.
 *
 * `entries` returns the same array object while nothing changed (no record, no sample crossing a window edge), so a
 * caller can skip work with an identity check.
 */
export class HealthWindow {
  private readonly samples = new Map<string, Sample[]>()
  private cache:
    | {
        nowMs: number
        staleAfter: number
        joinAt: number
        entries: HealthEntry[]
      }
    | undefined

  constructor(readonly windowMs: number) {}

  record(key: string, at: number, ms: number, outcome: RunOutcome): void {
    this.cache = undefined
    let list = this.samples.get(key)
    if (list) {
      // Recently recorded keys move to the back; the front is the one to evict.
      this.samples.delete(key)
    } else {
      if (this.samples.size >= MAX_KEYS) {
        const oldest = this.samples.keys().next().value
        if (oldest !== undefined) this.samples.delete(oldest)
      }
      list = []
    }
    this.samples.set(key, list)
    // Mostly in order: walk back from the end to the slot that keeps the list sorted by `at`.
    let i = list.length
    while (i > 0 && list[i - 1]!.at > at) i--
    list.splice(i, 0, { at, ms, outcome })
    if (list.length > MAX_SAMPLES) list.shift()
  }

  /** The entries as of `nowMs`, by key. Samples older than the window are dropped. */
  entries(nowMs: number): HealthEntry[] {
    const cache = this.cache
    if (
      cache &&
      nowMs >= cache.nowMs &&
      nowMs <= cache.staleAfter &&
      nowMs < cache.joinAt
    ) {
      return cache.entries
    }
    const cutoff = nowMs - this.windowMs
    // The cache holds while the clock stays in [nowMs, staleAfter] and below joinAt.
    let staleAfter = Number.POSITIVE_INFINITY
    let joinAt = Number.POSITIVE_INFINITY
    const entries: HealthEntry[] = []
    for (const [key, list] of this.samples) {
      let drop = 0
      while (drop < list.length && list[drop]!.at < cutoff) drop++
      if (drop) list.splice(0, drop)
      if (!list.length) {
        this.samples.delete(key)
        continue
      }
      // The first sample leaves the window once the clock passes its `at` plus the window.
      staleAfter = Math.min(staleAfter, list[0]!.at + this.windowMs)
      let count = 0
      while (count < list.length && list[count]!.at <= nowMs) count++
      // The first future sample joins the window when the clock reaches it.
      if (count < list.length) joinAt = Math.min(joinAt, list[count]!.at)
      if (!count) continue
      let errors = 0
      let denied = 0
      let total = 0
      for (let i = 0; i < count; i++) {
        const s = list[i]!
        if (s.outcome === 'error') errors++
        else if (s.outcome === 'denied') denied++
        total += s.ms
      }
      entries.push({
        key,
        runs: count,
        errors,
        denied,
        avgMs: Math.round((total / count) * 1000) / 1000,
      })
    }
    entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    this.cache = { nowMs, staleAfter, joinAt, entries }
    return entries
  }
}
