/**
 * Make filter → n8n v2 `FilterValue` parameters.
 *
 * A Make `filter` on a module is a GATE: the bundle passes only if the filter
 * matches, otherwise that path stops. n8n's Filter node has exactly those
 * semantics — `branch.ts` normalizes `typeShort: 'filter'` to a single case on
 * slot 0 with NO fallback, i.e. "a false result dead-ends". So a gated Make route
 * lowers onto a synthesized Filter node in front of the route's head module, and
 * `branch.ts` / `codegen` need no changes at all.
 *
 * Operator strings are `type:operation[:modifier]` (`text:equal`, `text:equal:ci`,
 * `number:greater`, `exist`). We translate onto the n8n v2 operator vocabulary the
 * same way `V1_OPERATION` translates n8n's own v1 names.
 */
import type { MakeCondition, MakeFilter } from './types.js'
import { bridgeMapper, isFullyBridged } from './iml.js'

/** Make `o` → n8n v2 `{ type, operation }`. */
const OPERATOR: Record<string, { type: string; operation: string }> = {
  'text:equal': { type: 'string', operation: 'equals' },
  'text:notequal': { type: 'string', operation: 'notEquals' },
  'text:contain': { type: 'string', operation: 'contains' },
  'text:notcontain': { type: 'string', operation: 'notContains' },
  'text:startswith': { type: 'string', operation: 'startsWith' },
  'text:endswith': { type: 'string', operation: 'endsWith' },
  'number:equal': { type: 'number', operation: 'equals' },
  'number:notequal': { type: 'number', operation: 'notEquals' },
  'number:greater': { type: 'number', operation: 'gt' },
  'number:greaterorequal': { type: 'number', operation: 'gte' },
  'number:less': { type: 'number', operation: 'lt' },
  'number:lessorequal': { type: 'number', operation: 'lte' },
  'boolean:equal': { type: 'boolean', operation: 'equals' },
  'boolean:notequal': { type: 'boolean', operation: 'notEquals' },
  'date:before': { type: 'dateTime', operation: 'before' },
  'date:after': { type: 'dateTime', operation: 'after' },
  'array:contain': { type: 'array', operation: 'contains' },
  'array:notcontain': { type: 'array', operation: 'notContains' },
  exist: { type: 'string', operation: 'exists' },
  notexist: { type: 'string', operation: 'notExists' },
}

/** Operators taking no right-hand operand. */
const UNARY = new Set(['exist', 'notexist'])

export interface FilterLowering {
  /** n8n v2 params for a Filter node — `{ conditions: { combinator, conditions } }`. */
  parameters: Record<string, unknown>
  /** Set when the filter could only be lowered approximately. */
  lossy?: string
}

/**
 * Translate one condition. `:ci` (case-insensitive) is a real modifier we cannot
 * express — n8n carries it as `caseSensitive` on the condition's options, which
 * `RawCondition` does not model. Reported rather than silently dropped.
 */
function lowerCondition(
  c: MakeCondition,
  idToName: Map<number, string>,
  lossy: string[]
): Record<string, unknown> | null {
  const raw = (c.o ?? '').toLowerCase()
  if (!raw) return null

  // `text:equal:ci` → base `text:equal` + the `ci` modifier.
  const ci = raw.endsWith(':ci')
  const base = ci ? raw.slice(0, -3) : raw
  const op = OPERATOR[base]
  if (!op) {
    lossy.push(`unmapped operator '${raw}'`)
    return null
  }
  // `:ci` is case-INsensitive. n8n carries that as `options.caseSensitive` on the
  // FilterValue, which `RawCondition` doesn't model — so lowering it as-is would
  // silently emit a STRICTER gate (fires less often than authored). Less
  // destructive than an over-firing gate, but still the wrong truth table, so it
  // gets the same refusal.
  if (ci) {
    lossy.push(`case-insensitive '${raw}' not expressible (would emit a stricter gate)`)
    return null
  }

  const left = bridgeMapper(c.a, idToName)
  const right = UNARY.has(base) ? undefined : bridgeMapper(c.b ?? '', idToName)

  // An operand that won't lower to a ref becomes a `transform`, and
  // `emitBranchInput` would render it as `left: undefined` — a gate with the
  // wrong truth table. Refuse the condition instead. (Common cause: Make's `[]`
  // array-iteration, e.g. `{{1.props.\`Event ID\`[].plain_text}}`.)
  if (!isFullyBridged(left) || !isFullyBridged(right)) {
    lossy.push(`operand not declaratively expressible in '${raw}'`)
    return null
  }

  const cond: Record<string, unknown> = {
    leftValue: left,
    operator: { type: op.type, operation: op.operation },
  }
  if (right !== undefined) cond.rightValue = right
  return cond
}

/**
 * Lower a Make filter onto n8n v2 Filter params.
 *
 * Make's `conditions` is a MATRIX — outer array ORs, inner array ANDs. n8n's v2
 * FilterValue is flat: ONE combinator over a flat condition list. So only two
 * shapes round-trip exactly:
 *
 *   [[a, b]]        → AND(a, b)              one group
 *   [[a], [b], [c]] → OR(a, b, c)            all groups single-condition
 *
 * A true mixed matrix (`[[a,b],[c,d]]` = (a AND b) OR (c AND d)) cannot be
 * expressed by one Filter node. Returns null rather than emit a gate with the
 * wrong truth table — an ungated route is visibly wrong; a subtly wrong
 * predicate is not.
 */
export function lowerFilter(
  filter: MakeFilter,
  idToName: Map<number, string>
): FilterLowering | null {
  const groups = (filter.conditions ?? []).filter((g) => Array.isArray(g) && g.length > 0)
  if (groups.length === 0) return null

  const lossy: string[] = []
  let combinator: 'and' | 'or'
  let flat: MakeCondition[]

  if (groups.length === 1) {
    combinator = 'and'
    flat = groups[0]!
  } else if (groups.every((g) => g.length === 1)) {
    combinator = 'or'
    flat = groups.map((g) => g[0]!)
  } else {
    return null // mixed OR-of-ANDs — not expressible as a single Filter
  }

  // Every condition must lower. Dropping one from an AND WEAKENS the predicate
  // (the gate fires more often than the author wrote); dropping one from an OR
  // strengthens it. Either way the truth table is wrong, so it's all or nothing.
  const conditions: Record<string, unknown>[] = []
  for (const c of flat) {
    const lowered = lowerCondition(c, idToName, lossy)
    if (!lowered) return null
    conditions.push(lowered)
  }
  if (conditions.length === 0) return null

  return {
    parameters: { conditions: { combinator, conditions } },
    ...(lossy.length ? { lossy: lossy.join('; ') } : {}),
  }
}
