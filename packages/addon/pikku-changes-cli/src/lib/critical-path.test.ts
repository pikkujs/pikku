import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { chainLengths } from './change-order.js'
import { priorityOrder } from './specialists.js'

type C = {
  changeId: string
  status: string
  title: string
  specialist: 'build' | 'frontend' | 'artifacts'
  dependsOn: string[]
}
const c = (
  changeId: string,
  specialist: C['specialist'],
  dependsOn: string[] = [],
  status = 'ready'
): C => ({ changeId, status, title: changeId, specialist, dependsOn })

// the shape of a real plan: a short backend tail, and a long frontend chain that waits on a short capture
const plan = [
  c('1', 'build', [], 'done'),
  c('15', 'build', ['1']),
  c('18', 'build', ['15']),
  c('2', 'artifacts', ['1']),
  c('3', 'frontend', ['2']),
  c('4', 'frontend', ['3']),
  c('5', 'frontend', ['3']),
  c('21', 'frontend', ['3', '18']),
]

describe('the critical path in a parallel loop', () => {
  test('chain lengths count the longest run of changes that wait behind one', () => {
    const lengths = chainLengths(
      plan.filter((x) => x.status === 'ready'),
      plan
    )
    assert.equal(lengths.get('2'), 3) // 2 -> 3 -> 21
    assert.equal(lengths.get('15'), 3) // 15 -> 18 -> 21
    assert.equal(lengths.get('4'), 1)
  })

  test('a frontend change goes first, then the longest chain, then the order filed', () => {
    const ready = plan.filter((x) => ['15', '2', '4'].includes(x.changeId))
    const ids = (list: C[]) => list.map((x) => x.changeId)
    assert.deepEqual(ids(priorityOrder(ready, chainLengths(ready, plan))), [
      '4',
      '15',
      '2',
    ])
    // with no frontend ready, 15 and 2 both unblock a chain of 3: ties keep the order they were filed in
    const tied = plan.filter((x) => ['15', '2'].includes(x.changeId))
    assert.deepEqual(ids(priorityOrder(tied, chainLengths(tied, plan))), [
      '15',
      '2',
    ])
  })

  test('the capture that gates a long frontend chain starts before backend changes nothing waits on', () => {
    const open = [
      c('9', 'build', ['1']),
      c('2', 'artifacts', ['1']),
      c('3', 'frontend', ['2']),
      c('4', 'frontend', ['3']),
      c('1', 'build', [], 'done'),
    ]
    const ready = open.filter(
      (x) =>
        x.status === 'ready' &&
        x.dependsOn.every(
          (d) => open.find((o) => o.changeId === d)?.status === 'done'
        )
    )
    assert.deepEqual(
      priorityOrder(ready, chainLengths(ready, open)).map((x) => x.changeId),
      ['2', '9']
    )
  })

  test('a cycle does not hang', () => {
    const loop = [c('x', 'build', ['y']), c('y', 'build', ['x'])]
    assert.ok(chainLengths(loop, loop).get('x')! >= 1)
  })
})
