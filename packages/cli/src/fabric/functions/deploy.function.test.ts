import { describe, test } from 'node:test'
import assert from 'node:assert'
import { branchFromHead } from './deploy.function.js'

describe('branchFromHead', () => {
  test('takes the checked-out branch as the deploy target', () => {
    assert.strictEqual(branchFromHead('feat/thing'), 'feat/thing')
  })

  // `rev-parse --abbrev-ref HEAD` answers the literal 'HEAD' when detached,
  // which would otherwise travel on as a branch name and come back as
  // "local branch HEAD does not exist".
  test('refuses a detached HEAD by name', () => {
    assert.throws(() => branchFromHead('HEAD'), /HEAD is detached/)
  })

  test('refuses an empty answer rather than deploying nothing', () => {
    assert.throws(() => branchFromHead(''), /HEAD is detached/)
  })
})
