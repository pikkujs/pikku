/**
 * A seeded PRNG, so a run replays exactly.
 *
 * Reproducibility is the whole point: a virtual user that finds something has
 * to be re-runnable into the same finding before it can be shrunk into a
 * regression scenario. `Math.random` would make every finding a one-off story.
 *
 * mulberry32 — 32 bits of state, uniform enough for scheduling weights, and
 * short enough to read.
 */
export const createRng = (seed: number) => {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    /** True with probability `p`. */
    chance: (p: number) => next() < p,
    /** A uniform pick, or undefined for an empty list. */
    pick: <T>(items: readonly T[]): T | undefined =>
      items.length === 0 ? undefined : items[Math.floor(next() * items.length)],
    /**
     * A weighted pick over `[key, weight]` pairs. Zero-weight keys can never be
     * drawn, which is how a disposition switches a move off entirely.
     */
    weighted: <K extends string>(
      weights: Readonly<Record<K, number>>
    ): K | undefined => {
      const entries = (Object.entries(weights) as [K, number][]).filter(
        ([, weight]) => weight > 0
      )
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
      if (total <= 0) return undefined
      let roll = next() * total
      for (const [key, weight] of entries) {
        roll -= weight
        if (roll <= 0) return key
      }
      return entries[entries.length - 1]?.[0]
    },
  }
}

/** The seeded generator the engine threads through a whole run. */
export type VirtualUserRng = ReturnType<typeof createRng>
