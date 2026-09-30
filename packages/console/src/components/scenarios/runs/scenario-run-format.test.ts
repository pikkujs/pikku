import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { runVersionLabel } from './scenario-run-format.js'

describe('runVersionLabel', () => {
  const commit = 'f98de20a5c1d4e7b90a2b3c4d5e6f7a8b9c0d1e2'

  test('abbreviates the commit and leaves a first attempt unsaid', () => {
    assert.equal(runVersionLabel({ commit, attempt: 1 }), 'f98de20')
  })

  test('numbers a re-run of the same commit', () => {
    assert.equal(runVersionLabel({ commit, attempt: 3 }), 'f98de20 #3')
  })

  test('marks a commit the tree had moved past', () => {
    assert.equal(
      runVersionLabel({ commit, dirty: true, attempt: 2 }),
      'f98de20+ #2'
    )
  })

  test('says nothing for a run with no version', () => {
    assert.equal(runVersionLabel(undefined), '')
  })
})
