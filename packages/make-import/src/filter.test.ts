import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { lowerFilter } from './filter.js'
import type { MakeFilter } from './types.js'

const ids = new Map([[1, 'notion1']])
const cond = (a: string, b: string | undefined, o: string) => ({ a, b, o })

/** Pull `{ combinator, conditions }` out of the lowered n8n v2 params. */
const fv = (f: MakeFilter) => {
  const l = lowerFilter(f, ids)
  return l && (l.parameters.conditions as { combinator: string; conditions: unknown[] })
}

describe('lowerFilter — shape', () => {
  it('one group ANDs its conditions', () => {
    const r = fv({ conditions: [[cond('{{1.a}}', 'x', 'text:equal'), cond('{{1.b}}', 'y', 'text:equal')]] })
    assert.equal(r?.combinator, 'and')
    assert.equal(r?.conditions.length, 2)
  })

  it('single-condition groups OR together', () => {
    const r = fv({ conditions: [[cond('{{1.a}}', 'x', 'text:equal')], [cond('{{1.b}}', 'y', 'text:equal')]] })
    assert.equal(r?.combinator, 'or')
    assert.equal(r?.conditions.length, 2)
  })

  it('REFUSES a mixed OR-of-ANDs — one Filter cannot express it', () => {
    const r = lowerFilter(
      {
        conditions: [
          [cond('{{1.a}}', 'x', 'text:equal'), cond('{{1.b}}', 'y', 'text:equal')],
          [cond('{{1.c}}', 'z', 'text:equal'), cond('{{1.d}}', 'w', 'text:equal')],
        ],
      },
      ids
    )
    assert.equal(r, null)
  })

  it('an empty filter lowers to nothing', () => {
    assert.equal(lowerFilter({ conditions: [] }, ids), null)
  })
})

describe('lowerFilter — operators', () => {
  it('maps text:equal onto the n8n v2 operator', () => {
    const r = fv({ conditions: [[cond('{{1.a}}', 'x', 'text:equal')]] })
    assert.deepEqual((r!.conditions[0] as any).operator, { type: 'string', operation: 'equals' })
  })

  it('maps number:greater to gt', () => {
    const r = fv({ conditions: [[cond('{{1.n}}', '5', 'number:greater')]] })
    assert.deepEqual((r!.conditions[0] as any).operator, { type: 'number', operation: 'gt' })
  })

  it('exist takes no right operand', () => {
    const r = fv({ conditions: [[cond('{{1.a}}', undefined, 'exist')]] })
    const c = r!.conditions[0] as any
    assert.equal(c.operator.operation, 'exists')
    assert.equal('rightValue' in c, false)
  })

  it('REFUSES an unknown operator rather than guessing', () => {
    assert.equal(lowerFilter({ conditions: [[cond('{{1.a}}', 'x', 'wat:nope')]] }, ids), null)
  })

  it('REFUSES :ci — it would silently emit a stricter (case-sensitive) gate', () => {
    assert.equal(lowerFilter({ conditions: [[cond('{{1.a}}', 'x', 'text:equal:ci')]] }, ids), null)
  })
})

describe('lowerFilter — operand safety (the destructive-gate guard)', () => {
  it('REFUSES an array-iteration operand — it would emit `left: undefined`', () => {
    // The real Notion→Calendar case: `{{1.props.`Event ID`[].plain_text}}` is a
    // transform, so emitBranchInput would render `left: undefined` and the gate
    // would have the wrong truth table.
    const r = lowerFilter(
      { conditions: [[cond('{{1.properties_value.`Event ID`[].plain_text}}', '{{null}}', 'text:equal')]] },
      ids
    )
    assert.equal(r, null)
  })

  it('REFUSES the WHOLE filter when only one condition fails', () => {
    // Dropping a failed condition from an AND weakens the predicate — the gate
    // would fire more often than authored. All or nothing.
    const r = lowerFilter(
      {
        conditions: [
          [
            cond('{{1.props.x[].y}}', 'a', 'text:equal'), // unlowerable
            cond('{{1.status}}', 'Scheduled', 'text:equal'), // fine
          ],
        ],
      },
      ids
    )
    assert.equal(r, null)
  })

  it('lowers a plain ref operand to a bridged n8n expression', () => {
    const r = fv({ conditions: [[cond('{{1.status}}', 'Scheduled', 'text:equal')]] })
    const c = r!.conditions[0] as any
    assert.equal(c.leftValue, '={{ $node["notion1"].json.status }}')
    assert.equal(c.rightValue, 'Scheduled')
  })
})
