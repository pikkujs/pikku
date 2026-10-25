import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { isUnauthorized } from './is-unauthorized.js'

describe('isUnauthorized', () => {
  test('a 401 is signed out', () => {
    assert.equal(isUnauthorized({ status: 401 }), true)
  })

  test('the 403 pikku answers a missing session with is signed out', () => {
    assert.equal(
      isUnauthorized({ status: 403, message: 'Authentication required' }),
      true
    )
  })

  test('a 403 for any other reason is a real denial, not a sign-out', () => {
    assert.equal(
      isUnauthorized({ status: 403, message: 'Permission denied' }),
      false
    )
  })

  test('anything that is not an error object is refused', () => {
    assert.equal(isUnauthorized(null), false)
    assert.equal(isUnauthorized('Authentication required'), false)
    assert.equal(isUnauthorized({ status: 500 }), false)
  })
})
