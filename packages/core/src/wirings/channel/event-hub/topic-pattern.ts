const WILDCARD = /\$\{(string|number)\}/g

type Part = { literal: string } | { wildcard: 'string' | 'number' }

const parse = (pattern: string): Part[] => {
  const parts: Part[] = []
  let last = 0
  for (const match of pattern.matchAll(WILDCARD)) {
    if (match.index > last)
      parts.push({ literal: pattern.slice(last, match.index) })
    parts.push({ wildcard: match[1] as 'string' | 'number' })
    last = match.index + match[0].length
  }
  if (last < pattern.length) parts.push({ literal: pattern.slice(last) })
  return parts
}

const escape = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const compiled = new Map<string, RegExp>()

const compile = (pattern: string): RegExp => {
  let regex = compiled.get(pattern)
  if (!regex) {
    const source = parse(pattern)
      .map((part) =>
        'literal' in part
          ? escape(part.literal)
          : part.wildcard === 'number'
            ? '-?\\d+(?:\\.\\d+)?'
            : '[\\s\\S]*'
      )
      .join('')
    regex = new RegExp(`^${source}$`)
    compiled.set(pattern, regex)
  }
  return regex
}

/**
 * Whether `topic` is one of the strings `pattern` describes. A pattern is a
 * topic written the way a TypeScript template literal type spells it:
 * `order:${string}` matches `order:` followed by any text. Both ends are anchored.
 */
export const matchesTopicPattern = (pattern: string, topic: string): boolean =>
  compile(pattern).test(topic)

/**
 * Whether some string could match both patterns. `${number}` is treated as
 * `${string}`, so the answer errs towards "overlap", which is the side that
 * refuses a registration rather than allowing a double delivery.
 */
export const topicPatternsOverlap = (a: string, b: string): boolean => {
  const left = parse(a)
  const right = parse(b)
  const memo = new Map<string, boolean>()

  const solve = (i: number, li: number, j: number, ri: number): boolean => {
    const key = `${i}:${li}:${j}:${ri}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    memo.set(key, false)

    const leftDone = i === left.length
    const rightDone = j === right.length
    let result: boolean
    if (leftDone && rightDone) result = true
    else if (leftDone) result = restIsWildcards(right, j, ri)
    else if (rightDone) result = restIsWildcards(left, i, li)
    else {
      const l = left[i]!
      const r = right[j]!
      if ('wildcard' in l) {
        result =
          solve(i + 1, 0, j, ri) ||
          ('wildcard' in r
            ? solve(i, li, j + 1, 0)
            : consumeOne(left, i, li, right, j, ri, true))
      } else if ('wildcard' in r) {
        result =
          solve(i, li, j + 1, 0) || consumeOne(left, i, li, right, j, ri, false)
      } else {
        const lc = l.literal[li]!
        const rc = r.literal[ri]!
        result =
          lc === rc &&
          solve(
            li + 1 === l.literal.length ? i + 1 : i,
            li + 1 === l.literal.length ? 0 : li + 1,
            ri + 1 === r.literal.length ? j + 1 : j,
            ri + 1 === r.literal.length ? 0 : ri + 1
          )
      }
    }
    memo.set(key, result)
    return result
  }

  const restIsWildcards = (parts: Part[], from: number, offset: number) =>
    offset === 0 && parts.slice(from).every((part) => 'wildcard' in part)

  // A wildcard on one side swallows one character of the literal on the other.
  const consumeOne = (
    l: Part[],
    i: number,
    li: number,
    r: Part[],
    j: number,
    ri: number,
    leftIsWildcard: boolean
  ): boolean => {
    if (leftIsWildcard) {
      const rp = r[j]!
      if (!('literal' in rp)) return false
      const done = ri + 1 === rp.literal.length
      return solve(i, li, done ? j + 1 : j, done ? 0 : ri + 1)
    }
    const lp = l[i]!
    if (!('literal' in lp)) return false
    const done = li + 1 === lp.literal.length
    return solve(done ? i + 1 : i, done ? 0 : li + 1, j, ri)
  }

  return solve(0, 0, 0, 0)
}
