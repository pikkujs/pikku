import type { HealthEntry, RunOutcome } from './types.js'

const MAX_KEYS = 2000
const MAX_SAMPLES = 1000

interface Sample {
  at: number
  ms: number
  outcome: RunOutcome
}

/**
 * Per-key counts over a sliding window. Bounded: at most 2000 keys and 1000 samples a key, the oldest go first, so
 * `runs` of a very busy key is capped at 1000.
 */
export class HealthWindow {
  private readonly samples = new Map<string, Sample[]>()

  constructor(readonly windowMs: number) {}

  record(key: string, at: number, ms: number, outcome: RunOutcome): void {
    let list = this.samples.get(key)
    if (!list) {
      if (this.samples.size >= MAX_KEYS) {
        const oldest = this.samples.keys().next().value
        if (oldest !== undefined) this.samples.delete(oldest)
      }
      list = []
      this.samples.set(key, list)
    }
    list.push({ at, ms, outcome })
    if (list.length > MAX_SAMPLES) list.shift()
  }

  /** The entries as of `nowMs`, by key. Samples older than the window are dropped. */
  entries(nowMs: number): HealthEntry[] {
    const entries: HealthEntry[] = []
    for (const [key, list] of this.samples) {
      const cutoff = nowMs - this.windowMs
      let drop = 0
      while (drop < list.length && list[drop]!.at < cutoff) drop++
      if (drop) list.splice(0, drop)
      if (!list.length) {
        this.samples.delete(key)
        continue
      }
      const inWindow = list.filter((s) => s.at <= nowMs)
      if (!inWindow.length) continue
      let errors = 0
      let denied = 0
      let total = 0
      for (const s of inWindow) {
        if (s.outcome === 'error') errors++
        else if (s.outcome === 'denied') denied++
        total += s.ms
      }
      entries.push({
        key,
        runs: inWindow.length,
        errors,
        denied,
        avgMs: Math.round((total / inWindow.length) * 1000) / 1000,
      })
    }
    return entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }
}
