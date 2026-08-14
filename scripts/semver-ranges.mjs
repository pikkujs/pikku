// Just enough semver range algebra to answer "can one version satisfy both of
// these ranges?" — deliberately dependency-free, because the CI job that runs
// the peer-dependency check (and its sibling checks) is a pre-install gate:
// checkout, setup-node, plain `node`, no `yarn install`.
//
// A range becomes a union of half-open intervals, and two ranges intersect when
// any interval of one overlaps any interval of the other. Prerelease tags are
// stripped rather than ordered — no peer range in this repo uses one, and
// getting prerelease precedence subtly wrong is worse than declining to model it.

const INF = Symbol('infinity')

/** Parse "1.2.3" / "1.2" / "1" / "v1.2.3" / "1.2.3-beta.1" into [maj, min, pat]. */
function parseVersion(raw) {
  const cleaned = raw
    .trim()
    .replace(/^[v=]+/, '')
    .split(/[-+]/)[0]
  const parts = cleaned.split('.')
  const nums = parts.map((p) =>
    p === '' || /^[xX*]$/.test(p) ? null : Number(p)
  )
  if (nums.some((n) => n !== null && !Number.isInteger(n))) return null
  // Always length 3, padding absent components with null rather than leaving
  // them undefined — every caller distinguishes "not given" from "given as 0".
  return [nums[0] ?? null, nums[1] ?? null, nums[2] ?? null]
}

function cmp(a, b) {
  if (a === INF) return b === INF ? 0 : 1
  if (b === INF) return -1
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0)
  }
  return 0
}

const ZERO = [0, 0, 0]
const FULL = { min: ZERO, minIncl: true, max: INF, maxIncl: false }

/** The interval a partial version denotes when used bare: 1.2 -> [1.2.0, 1.3.0). */
function partialInterval(v) {
  const [maj, min, pat] = v
  if (maj === null) return FULL
  if (min === null)
    return {
      min: [maj, 0, 0],
      minIncl: true,
      max: [maj + 1, 0, 0],
      maxIncl: false,
    }
  if (pat === null)
    return {
      min: [maj, min, 0],
      minIncl: true,
      max: [maj, min + 1, 0],
      maxIncl: false,
    }
  return {
    min: [maj, min, pat],
    minIncl: true,
    max: [maj, min, pat],
    maxIncl: true,
  }
}

/** Caret: compatible-with, pinned at the leftmost non-zero component. */
function caretInterval(v) {
  const [maj, min, pat] = v
  if (maj === null) return FULL
  const lo = [maj, min ?? 0, pat ?? 0]
  let hi
  if (maj !== 0) hi = [maj + 1, 0, 0]
  else if (min === null) hi = [1, 0, 0]
  else if (min !== 0) hi = [0, min + 1, 0]
  else if (pat === null) hi = [0, 1, 0]
  else hi = [0, 0, pat + 1]
  return { min: lo, minIncl: true, max: hi, maxIncl: false }
}

/** Tilde: allows patch drift, and minor drift only when no minor was given. */
function tildeInterval(v) {
  const [maj, min, pat] = v
  if (maj === null) return FULL
  const lo = [maj, min ?? 0, pat ?? 0]
  const hi = min === null ? [maj + 1, 0, 0] : [maj, min + 1, 0]
  return { min: lo, minIncl: true, max: hi, maxIncl: false }
}

/** Intersect two intervals, or null when they do not overlap. */
function intersectIntervals(a, b) {
  let min, minIncl
  const c = cmp(a.min, b.min)
  if (c > 0) [min, minIncl] = [a.min, a.minIncl]
  else if (c < 0) [min, minIncl] = [b.min, b.minIncl]
  else [min, minIncl] = [a.min, a.minIncl && b.minIncl]

  let max, maxIncl
  const d = cmp(a.max, b.max)
  if (d < 0) [max, maxIncl] = [a.max, a.maxIncl]
  else if (d > 0) [max, maxIncl] = [b.max, b.maxIncl]
  else [max, maxIncl] = [a.max, a.maxIncl && b.maxIncl]

  const e = cmp(min, max)
  if (e > 0) return null
  if (e === 0 && !(minIncl && maxIncl)) return null
  return { min, minIncl, max, maxIncl }
}

/** One comparator ("^1.2.3", ">=2", "<3.0.0", "1.x") as an interval. */
function comparatorInterval(token) {
  const t = token.trim()
  if (t === '' || t === '*' || /^[xX]$/.test(t)) return FULL

  const m = t.match(/^(\^|~>?|>=|<=|>|<|=)?\s*(.+)$/)
  if (!m) return null
  const [, op = '', rest] = m
  const v = parseVersion(rest)
  if (v === null) return null

  switch (op) {
    case '^':
      return caretInterval(v)
    case '~':
    case '~>':
      return tildeInterval(v)
    case '>=':
      return v[0] === null
        ? FULL
        : { ...FULL, min: [v[0], v[1] ?? 0, v[2] ?? 0] }
    case '>': {
      if (v[0] === null) return null
      const p = partialInterval(v)
      return {
        min: p.max,
        minIncl: p.maxIncl ? false : true,
        max: INF,
        maxIncl: false,
      }
    }
    case '<=': {
      if (v[0] === null) return FULL
      const p = partialInterval(v)
      return { min: ZERO, minIncl: true, max: p.max, maxIncl: p.maxIncl }
    }
    case '<':
      if (v[0] === null) return null
      return {
        min: ZERO,
        minIncl: true,
        max: [v[0], v[1] ?? 0, v[2] ?? 0],
        maxIncl: false,
      }
    default:
      return partialInterval(v)
  }
}

/**
 * A range as a union of intervals, or null when it cannot be parsed.
 * Unparseable is reported to the caller rather than treated as permissive —
 * silently passing a range nobody understands is how drift gets through.
 */
export function rangeToIntervals(range) {
  if (typeof range !== 'string') return null
  const union = []
  for (const alt of range.split('||')) {
    const trimmed = alt.trim()

    // Hyphen range: "1.2.3 - 2.3.4"
    const hyphen = trimmed.match(/^(.+?)\s+-\s+(.+)$/)
    if (hyphen) {
      const lo = parseVersion(hyphen[1])
      const hiV = parseVersion(hyphen[2])
      if (lo === null || hiV === null) return null
      const hiP = partialInterval(hiV)
      union.push({
        min: lo[0] === null ? ZERO : [lo[0], lo[1] ?? 0, lo[2] ?? 0],
        minIncl: true,
        max: hiP.max,
        maxIncl: hiP.maxIncl,
      })
      continue
    }

    let acc = FULL
    const tokens = trimmed.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) {
      union.push(FULL)
      continue
    }
    for (const token of tokens) {
      const iv = comparatorInterval(token)
      if (iv === null) return null
      acc = intersectIntervals(acc, iv)
      if (acc === null) break
    }
    if (acc !== null) union.push(acc)
  }
  return union
}

/** True when at least one version satisfies both ranges. Null-safe on garbage. */
export function intersects(a, b) {
  const ia = rangeToIntervals(a)
  const ib = rangeToIntervals(b)
  if (ia === null || ib === null) return null
  for (const x of ia) {
    for (const y of ib) {
      if (intersectIntervals(x, y) !== null) return true
    }
  }
  return false
}

/** True when the range admits every version. */
export function isUnbounded(range) {
  const intervals = rangeToIntervals(range)
  if (intervals === null) return false
  return intervals.some(
    (i) => i.max === INF && cmp(i.min, ZERO) === 0 && i.minIncl
  )
}

/** False when the range is not semver syntax at all (`"latest"`, `"^^1"`). */
export function isParseable(range) {
  return rangeToIntervals(range) !== null
}

/**
 * False when the range parses but no version can ever satisfy it (`"<0"`,
 * `">=2 <1"`). Worth separating from unparseable: the syntax is fine, the
 * meaning is empty, and the fix is different.
 */
export function isSatisfiable(range) {
  const intervals = rangeToIntervals(range)
  return intervals !== null && intervals.length > 0
}
