/** One value per dimension, possibly only some of them while being built. */
export type Combo = Record<string, string>

export type Dimensions = Record<string, readonly string[]>

/** Every combination of the named dimensions. */
export const crossProduct = (dimensions: Dimensions): Combo[] =>
  Object.entries(dimensions).reduce<Combo[]>(
    (combos, [name, values]) =>
      combos.flatMap((combo) =>
        values.map((value) => ({ ...combo, [name]: value }))
      ),
    [{}]
  )

const pairKey = (a: string, x: string, b: string, y: string) =>
  a < b ? `${a}=${x}&${b}=${y}` : `${b}=${y}&${a}=${x}`

/**
 * Finds whole combinations covering every pair of values across `dimensions`,
 * deterministically. A partial combination `allowed` refuses is never extended,
 * and a pair no allowed combination can hold is returned in `impossible` rather
 * than dropped, so a caller can account for it.
 *
 * Greedy: each round takes the first uncovered pair and fills the remaining
 * dimensions with whichever value covers the most new pairs, backtracking when
 * `allowed` closes a branch.
 */
export const pairwiseCombos = (
  dimensions: Dimensions,
  allowed: (partial: Combo) => boolean = () => true
): { combos: Combo[]; impossible: string[]; pairs: number } => {
  const names = Object.keys(dimensions)
  const uncovered = new Map<string, Combo>()
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const [a, b] = [names[i]!, names[j]!]
      for (const x of dimensions[a]!) {
        for (const y of dimensions[b]!) {
          uncovered.set(pairKey(a, x, b, y), { [a]: x, [b]: y })
        }
      }
    }
  }
  const pairs = uncovered.size

  const covers = (combo: Combo, name: string, value: string) => {
    let count = 0
    for (const other of Object.keys(combo)) {
      if (
        other !== name &&
        uncovered.has(pairKey(name, value, other, combo[other]!))
      ) {
        count++
      }
    }
    return count
  }

  const complete = (combo: Combo, remaining: string[]): Combo | undefined => {
    if (!allowed(combo)) return undefined
    const [name, ...rest] = remaining
    if (!name) return combo
    const ranked = dimensions[name]!.map((value, order) => ({
      value,
      order,
      gain: covers(combo, name, value),
    })).sort((x, y) => y.gain - x.gain || x.order - y.order)
    for (const { value } of ranked) {
      const found = complete({ ...combo, [name]: value }, rest)
      if (found) return found
    }
    return undefined
  }

  const combos: Combo[] = []
  const impossible: string[] = []
  while (uncovered.size > 0) {
    const [key, seed] = uncovered.entries().next().value as [string, Combo]
    const combo = complete(
      seed,
      names.filter((name) => !(name in seed))
    )
    if (!combo) {
      uncovered.delete(key)
      impossible.push(key)
      continue
    }
    combos.push(combo)
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [a, b] = [names[i]!, names[j]!]
        uncovered.delete(pairKey(a, combo[a]!, b, combo[b]!))
      }
    }
  }
  return { combos, impossible, pairs }
}
