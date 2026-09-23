import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { virtualUserRunRefused } from './virtualUserRunRefused.js'

describe('virtualUserRunRefused', () => {
  test('production refuses every disposition but the accountable one', () => {
    for (const disposition of [
      'realistic',
      'careless',
      'newcomer',
      'stale',
      'auditor',
      'adversarial',
    ]) {
      assert.equal(virtualUserRunRefused(disposition, true), true, disposition)
    }
  })

  test('production lets the accountable disposition run', () => {
    assert.equal(virtualUserRunRefused('accountable', true), false)
  })

  test('anywhere else every disposition runs', () => {
    assert.equal(virtualUserRunRefused('adversarial', false), false)
    assert.equal(virtualUserRunRefused('adversarial', undefined), false)
  })
})
