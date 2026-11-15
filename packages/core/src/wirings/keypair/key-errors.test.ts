import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PikkuError } from '../../errors/error-handler.js'
import { pikkuState } from '../../pikku-state.js'
import {
  DomainPolicyError,
  KeyCustodyLostError,
  KeyRetiredError,
  KeyRotatedError,
  KeyUnavailableError,
} from './key-errors.js'

describe('key service errors', () => {
  test('every error is an expected PikkuError carrying its own name', () => {
    for (const E of [
      DomainPolicyError,
      KeyCustodyLostError,
      KeyRetiredError,
      KeyUnavailableError,
    ]) {
      const e = new E('boom')
      assert.ok(e instanceof PikkuError)
      assert.equal(e.name, E.name)
      assert.equal(e.message, 'boom')
    }
  })

  test('each is registered with a status, and what the caller is told names no key', () => {
    const errors = pikkuState(null, 'misc', 'errors')
    const statuses = new Map<unknown, number>([
      [KeyUnavailableError, 503],
      [KeyRotatedError, 409],
      [KeyRetiredError, 500],
      [KeyCustodyLostError, 500],
      [DomainPolicyError, 500],
    ])
    for (const [E, status] of statuses) {
      const details = errors.get(E as never)
      assert.equal(details?.status, status)
      assert.doesNotMatch(details!.message, /kid|private|PRIVATE/i)
    }
  })

  test('KeyRotatedError carries the current active public key so the caller can re-seal', () => {
    const e = new KeyRotatedError('kid-2', 'c3BraQ==')
    assert.equal(e.kid, 'kid-2')
    assert.equal(e.publicKey, 'c3BraQ==')
    assert.ok(e instanceof PikkuError)
  })
})
