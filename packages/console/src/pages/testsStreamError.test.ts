import { test } from 'node:test'
import assert from 'node:assert/strict'

import { getTestStreamErrorMessage } from './testsStreamError.js'

test('prefers the structured message field when present', () => {
  assert.equal(
    getTestStreamErrorMessage({ type: 'error', message: 'No tests found' }),
    'No tests found'
  )
})

test('falls back to errorText for framework-generated SSE errors', () => {
  assert.equal(
    getTestStreamErrorMessage({
      type: 'error',
      errorText: 'The server cannot find the requested resource.',
    }),
    'No function-test harness found. Run `pikku tests init`, then run tests again.'
  )
})

test('falls back to a generic message when neither field is present', () => {
  assert.equal(
    getTestStreamErrorMessage({ type: 'error' }),
    'Failed to run tests'
  )
})
