import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

const BranchCondition = z.object({
  left: z.unknown().describe('Left-hand operand (resolved before evaluation)'),
  right: z
    .unknown()
    .optional()
    .describe('Right-hand operand — omitted for unary operators like isEmpty'),
  type: z
    .enum(['string', 'number', 'boolean', 'dateTime', 'array', 'object'])
    .default('string')
    .describe('Value type the operands are coerced to before comparison'),
  operation: z
    .string()
    .describe('Comparison operation, e.g. equals, contains, gt, isEmpty'),
})

const BranchCase = z.object({
  key: z
    .string()
    .describe('The `next` branch key to take when this case matches'),
  combinator: z
    .enum(['and', 'or'])
    .default('and')
    .describe('How the conditions combine'),
  conditions: z.array(BranchCondition),
})

export const BranchInput = z.object({
  cases: z
    .array(BranchCase)
    .describe('Cases evaluated in order; the first match wins'),
  fallback: z
    .string()
    .optional()
    .describe('Branch key taken when no case matches'),
})

export const BranchOutput = z.object({
  branch: z
    .string()
    .nullable()
    .describe('The branch key taken, or null when the path dead-ends'),
})

type Condition = z.infer<typeof BranchCondition>

const asString = (v: unknown): string => (v == null ? '' : String(v))
const asNumber = (v: unknown): number => Number(v)
const asBool = (v: unknown): boolean => v === true || v === 'true'
const asTime = (v: unknown): number => new Date(v as string).getTime()
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function evaluateCondition({
  left,
  right,
  type,
  operation,
}: Condition): boolean {
  switch (type) {
    case 'string': {
      const l = asString(left)
      const r = asString(right)
      switch (operation) {
        case 'equals':
          return l === r
        case 'notEquals':
          return l !== r
        case 'contains':
          return l.includes(r)
        case 'notContains':
          return !l.includes(r)
        case 'startsWith':
          return l.startsWith(r)
        case 'notStartsWith':
          return !l.startsWith(r)
        case 'endsWith':
          return l.endsWith(r)
        case 'notEndsWith':
          return !l.endsWith(r)
        case 'regex':
          return new RegExp(r).test(l)
        case 'notRegex':
          return !new RegExp(r).test(l)
        case 'isEmpty':
          return l === ''
        case 'isNotEmpty':
          return l !== ''
        case 'exists':
          return left != null
        case 'notExists':
          return left == null
      }
      break
    }
    case 'number': {
      const l = asNumber(left)
      const r = asNumber(right)
      switch (operation) {
        case 'equals':
          return l === r
        case 'notEquals':
          return l !== r
        case 'gt':
          return l > r
        case 'gte':
          return l >= r
        case 'lt':
          return l < r
        case 'lte':
          return l <= r
        case 'isEmpty':
          return left == null || Number.isNaN(l)
        case 'isNotEmpty':
          return left != null && !Number.isNaN(l)
        case 'exists':
          return left != null
        case 'notExists':
          return left == null
      }
      break
    }
    case 'boolean': {
      const l = asBool(left)
      switch (operation) {
        case 'true':
          return l === true
        case 'false':
          return l === false
        case 'equals':
          return l === asBool(right)
        case 'notEquals':
          return l !== asBool(right)
        case 'exists':
          return left != null
        case 'notExists':
          return left == null
      }
      break
    }
    case 'dateTime': {
      const l = asTime(left)
      const r = asTime(right)
      switch (operation) {
        case 'after':
          return l > r
        case 'before':
          return l < r
        case 'afterOrEquals':
          return l >= r
        case 'beforeOrEquals':
          return l <= r
        case 'equals':
          return l === r
        case 'notEquals':
          return l !== r
      }
      break
    }
    case 'array': {
      const l = asArray(left)
      switch (operation) {
        case 'contains':
          return l.includes(right)
        case 'notContains':
          return !l.includes(right)
        case 'lengthEquals':
          return l.length === asNumber(right)
        case 'lengthNotEquals':
          return l.length !== asNumber(right)
        case 'lengthGt':
          return l.length > asNumber(right)
        case 'lengthGte':
          return l.length >= asNumber(right)
        case 'lengthLt':
          return l.length < asNumber(right)
        case 'lengthLte':
          return l.length <= asNumber(right)
        case 'isEmpty':
          return l.length === 0
        case 'isNotEmpty':
          return l.length > 0
      }
      break
    }
    case 'object': {
      switch (operation) {
        case 'isEmpty':
          return left == null || Object.keys(left as object).length === 0
        case 'isNotEmpty':
          return left != null && Object.keys(left as object).length > 0
        case 'exists':
          return left != null
        case 'notExists':
          return left == null
      }
      break
    }
  }
  throw new Error(`graph:branch — unsupported operator "${type}.${operation}"`)
}

export const branch = pikkuSessionlessFunc({
  description:
    'Route to a branch by evaluating declarative conditions (IF / Switch / Filter)',
  node: { displayName: 'Branch', category: 'Logic', type: 'action' },
  input: BranchInput,
  output: BranchOutput,
  func: async (_services, data, { graph }) => {
    for (const branchCase of data.cases) {
      const results = branchCase.conditions.map(evaluateCondition)
      const matched =
        branchCase.combinator === 'or'
          ? results.some(Boolean)
          : results.every(Boolean)
      if (matched) {
        graph?.branch(branchCase.key)
        return { branch: branchCase.key }
      }
    }
    if (data.fallback) {
      graph?.branch(data.fallback)
      return { branch: data.fallback }
    }
    return { branch: null }
  },
})
