/**
 * Normalize n8n conditional nodes (IF / Filter / Switch) into a canonical
 * branch spec that maps onto @pikku/addon-graph's `branch` function. Structural
 * only — operand values stay raw (n8n literals or `={{ … }}` expressions) and are
 * lowered to `ref`/`template`/literal by the codegen.
 *
 * Branch keys are output-slot indices ("0", "1", …) so they line up with the
 * graph `next` Record the topology emits. IF: slot 0 = true, slot 1 = false.
 * Filter: slot 0 = kept (no fallback — a false result dead-ends). Switch: one
 * slot per rule, plus an optional `extra` fallback slot.
 */

export interface RawCondition {
  left: unknown
  right?: unknown
  type: string
  operation: string
}

export interface RawCase {
  key: string
  combinator: 'and' | 'or'
  conditions: RawCondition[]
}

export interface BranchSpec {
  cases: RawCase[]
  fallback?: string
}

interface BranchNode {
  typeShort: string
  parameters: Record<string, unknown>
}

/** n8n v1 operator names → the v2 names @pikku/addon-graph's `branch` uses. */
const V1_OPERATION: Record<string, string> = {
  equal: 'equals',
  notEqual: 'notEquals',
  smaller: 'lt',
  smallerEqual: 'lte',
  larger: 'gt',
  largerEqual: 'gte',
}

const mapOperation = (op: string): string => V1_OPERATION[op] ?? op

const combinatorOf = (fv: unknown): 'and' | 'or' =>
  (fv as { combinator?: unknown } | undefined)?.combinator === 'or'
    ? 'or'
    : 'and'

/** v2 FilterValue: `{ combinator, conditions: [{ leftValue, rightValue, operator }] }`. */
function fromFilterValue(fv: unknown): RawCondition[] | null {
  const conditions = (fv as { conditions?: unknown } | undefined)?.conditions
  if (!Array.isArray(conditions)) return null
  const out: RawCondition[] = []
  for (const c of conditions) {
    if (!c || typeof c !== 'object') return null
    const cond = c as Record<string, unknown>
    const operator = cond.operator as Record<string, unknown> | undefined
    if (!operator) return null
    out.push({
      left: cond.leftValue,
      right: cond.rightValue,
      type: String(operator.type ?? 'string'),
      operation: mapOperation(String(operator.operation ?? '')),
    })
  }
  return out.length > 0 ? out : null
}

/** v1 conditions: `{ string: [{ value1, operation, value2 }], number: [...], … }`. */
function fromV1Conditions(conds: unknown): RawCondition[] | null {
  if (!conds || typeof conds !== 'object') return null
  const groups = conds as Record<string, unknown>
  const out: RawCondition[] = []
  for (const type of ['string', 'number', 'boolean', 'dateTime', 'array']) {
    const group = groups[type]
    if (!Array.isArray(group)) continue
    for (const c of group) {
      if (!c || typeof c !== 'object') continue
      const cond = c as Record<string, unknown>
      out.push({
        left: cond.value1,
        right: cond.value2,
        type,
        operation: mapOperation(String(cond.operation ?? '')),
      })
    }
  }
  return out.length > 0 ? out : null
}

function conditionsOf(node: BranchNode): {
  conditions: RawCondition[]
  combinator: 'and' | 'or'
} | null {
  const p = node.parameters
  const v2 = fromFilterValue(p.conditions)
  if (v2) return { conditions: v2, combinator: combinatorOf(p.conditions) }
  const v1 = fromV1Conditions(p.conditions)
  if (v1) {
    return {
      conditions: v1,
      combinator: p.combineOperation === 'any' ? 'or' : 'and',
    }
  }
  return null
}

/**
 * v1 Switch: a shared left operand (`value1`) and `dataType` at the node level,
 * with each `rules.rules[]` row supplying an `operation` + `value2` and an
 * optional `output` slot (defaulting to the row index). `fallbackOutput` names
 * the default slot. Each row lowers to a single-condition case keyed by its
 * output slot, so it lines up with the graph `next` Record.
 */
function switchV1Spec(node: BranchNode): BranchSpec | null {
  const p = node.parameters
  const rules = (p.rules as { rules?: unknown } | undefined)?.rules
  if (!Array.isArray(rules) || rules.length === 0) return null
  const type = typeof p.dataType === 'string' ? p.dataType : 'string'
  const cases: RawCase[] = []
  rules.forEach((raw, i) => {
    const rule = (raw ?? {}) as Record<string, unknown>
    const output = typeof rule.output === 'number' ? rule.output : i
    cases.push({
      key: String(output),
      combinator: 'and',
      conditions: [
        {
          left: p.value1,
          right: rule.value2,
          type,
          operation: mapOperation(String(rule.operation ?? 'equal')),
        },
      ],
    })
  })
  const fb = p.fallbackOutput
  const fallback =
    typeof fb === 'number' && fb >= 0
      ? String(fb)
      : fb === 'extra'
        ? String(rules.length)
        : undefined
  return { cases, fallback }
}

function switchSpec(node: BranchNode): BranchSpec | null {
  const p = node.parameters
  if (p.mode === 'expression') return null
  const rules = (p.rules as { values?: unknown } | undefined)?.values
  if (!Array.isArray(rules)) return switchV1Spec(node)
  const cases: RawCase[] = []
  rules.forEach((rule, i) => {
    const conditions = fromFilterValue(
      (rule as Record<string, unknown> | undefined)?.conditions
    )
    if (conditions) {
      cases.push({
        key: String(i),
        combinator: combinatorOf((rule as Record<string, unknown>).conditions),
        conditions,
      })
    }
  })
  if (cases.length === 0) return null
  const fallbackOutput = (p.options as Record<string, unknown> | undefined)
    ?.fallbackOutput
  const fallback = fallbackOutput === 'extra' ? String(rules.length) : undefined
  return { cases, fallback }
}

/**
 * Build a branch spec for an IF / Filter / Switch node, or `null` when the node
 * isn't a supported conditional (e.g. Switch expression-mode → stays a stub).
 */
export function normalizeBranch(node: BranchNode): BranchSpec | null {
  const short = node.typeShort.toLowerCase()

  if (short === 'if' || short === 'filter') {
    const c = conditionsOf(node)
    if (!c) return null
    const cases: RawCase[] = [
      { key: '0', combinator: c.combinator, conditions: c.conditions },
    ]
    // IF routes false items out of slot 1; Filter simply drops them.
    return short === 'if' ? { cases, fallback: '1' } : { cases }
  }

  if (short === 'switch') return switchSpec(node)

  return null
}
