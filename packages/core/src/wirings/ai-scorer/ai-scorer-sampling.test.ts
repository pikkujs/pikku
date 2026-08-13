import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { isSampled } from './ai-scorer-sampling.js'

describe('isSampled', () => {
  test('grades every run at a rate of 1 and none at 0', () => {
    assert.equal(isSampled('run-1', 'relevance', 1), true)
    assert.equal(isSampled('run-1', 'relevance', 0), false)
  })

  test('lands the same way every time it is asked, so a retried job is not regraded by chance', () => {
    const first = isSampled('run-42', 'relevance', 0.5)
    for (let i = 0; i < 20; i++) {
      assert.equal(isSampled('run-42', 'relevance', 0.5), first)
    }
  })

  test('two scorers at the same rate do not sample the same set of runs', () => {
    const runs = Array.from({ length: 200 }, (_, i) => `run-${i}`)
    const a = runs.filter((run) => isSampled(run, 'relevance', 0.5))
    const b = runs.filter((run) => isSampled(run, 'toxicity', 0.5))
    assert.notDeepEqual(a, b)
  })

  test('samples roughly the requested fraction over many runs', () => {
    const runs = Array.from({ length: 2000 }, (_, i) => `run-${i}`)
    const sampled = runs.filter((run) => isSampled(run, 'relevance', 0.25))
    const rate = sampled.length / runs.length
    assert.ok(
      rate > 0.2 && rate < 0.3,
      `expected roughly 0.25 of runs to be sampled, got ${rate}`
    )
  })
})
