import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { crossProduct, pairwiseCombos } from './pairwise.js'
import {
  chainMatrix,
  EXCLUSIONS,
  exclusionOf,
  pairwiseMatrix,
  workflowMatrix,
} from './dimensions.js'

describe('pairwiseCombos', () => {
  const dimensions = {
    a: ['1', '2', '3'],
    b: ['x', 'y'],
    c: ['p', 'q', 'r'],
    d: ['m', 'n'],
  }
  const pairsOf = (combo: Record<string, string>) => {
    const entries = Object.entries(combo).sort(([a], [b]) => (a < b ? -1 : 1))
    return entries.flatMap(([a, x], i) =>
      entries.slice(i + 1).map(([b, y]) => `${a}=${x}&${b}=${y}`)
    )
  }

  test('covers every pair in fewer combinations than the cross product', () => {
    const { combos, impossible } = pairwiseCombos(dimensions, () => true)
    const covered = new Set(combos.flatMap(pairsOf))
    for (const pair of crossProduct(dimensions).flatMap(pairsOf)) {
      assert.ok(covered.has(pair), `${pair} is not covered`)
    }
    assert.deepEqual(impossible, [])
    assert.ok(combos.length < crossProduct(dimensions).length)
  })

  test('is deterministic', () => {
    assert.deepEqual(
      pairwiseCombos(dimensions, () => true).combos,
      pairwiseCombos(dimensions, () => true).combos
    )
  })

  test('returns a pair no allowed combination can hold', () => {
    const { combos, impossible } = pairwiseCombos(
      dimensions,
      ({ a, b }) => !(a === '1' && b === 'x')
    )
    assert.ok(combos.every(({ a, b }) => !(a === '1' && b === 'x')))
    assert.ok(impossible.includes('a=1&b=x'))
  })
})

describe('the matrix accounts for everything it drops', () => {
  for (const matrix of [chainMatrix, workflowMatrix]) {
    const { combos, report } = matrix()
    test(`${report.name} adds up`, () => {
      const dropped = Object.values(report.excluded).reduce((a, b) => a + b, 0)
      assert.equal(report.generated, combos.length + dropped)
      assert.equal(report.included, combos.length)
      for (const combo of combos) assert.equal(exclusionOf(combo), undefined)
    })
  }

  test('pairwise leaves nothing out but what a rule refuses', () => {
    const { combos, report } = pairwiseMatrix()
    assert.ok(combos.length > 0)
    for (const combo of combos) assert.equal(exclusionOf(combo), undefined)
    const dropped = Object.values(report.excluded).reduce((a, b) => a + b, 0)
    assert.equal(report.generated, report.included + dropped)
  })

  test('every exclusion rule says why and is used', () => {
    const used = new Set(
      [chainMatrix(), workflowMatrix()].flatMap(({ report }) =>
        Object.keys(report.excluded)
      )
    )
    for (const id of pairwiseMatrix().rulesUsed) used.add(id)
    for (const { id, why } of EXCLUSIONS) {
      assert.ok(why.length > 0, `${id} gives no reason`)
      assert.ok(used.has(id), `${id} excludes nothing, so it should go`)
    }
  })
})
