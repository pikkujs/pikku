import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isSuspendReason,
  suspendReasonCopy,
  suspendReasonText,
} from './workflow-suspend.js'

describe('isSuspendReason', () => {
  test('a suspended run’s error row is a reason, not a failure', () => {
    assert.equal(
      isSuspendReason('suspended', {
        message: 'Needs approval',
        code: 'WORKFLOW_SUSPENDED',
      }),
      true
    )
    assert.equal(
      isSuspendReason('suspended', {
        message: "RPC 'x' not found. Deploy the missing function and resume.",
        code: 'RPC_NOT_FOUND',
      }),
      true
    )
  })

  test('a failed run is still a failure', () => {
    assert.equal(
      isSuspendReason('failed', {
        message: 'boom',
        code: 'WORKFLOW_SUSPENDED',
      }),
      false,
      'status must win — a failed run is never merely suspended'
    )
    assert.equal(isSuspendReason('failed', { message: 'boom' }), false)
  })

  test('a suspended run with an unrecognised code is treated as a real error', () => {
    assert.equal(
      isSuspendReason('suspended', { message: 'boom', code: 'SOMETHING_ELSE' }),
      false,
      'better to over-report an error than to hide a genuine one behind a reassuring "waiting" card'
    )
  })

  test('no error means nothing to present either way', () => {
    assert.equal(isSuspendReason('suspended', undefined), false)
    assert.equal(isSuspendReason('completed', undefined), false)
  })
})

describe('suspendReasonCopy', () => {
  test('a missing RPC tells the operator to deploy, not to approve', () => {
    const copy = suspendReasonCopy({ code: 'RPC_NOT_FOUND' })
    assert.match(copy.title, /missing function/i)
    assert.match(copy.hint ?? '', /deploy/i)
  })

  test('an ordinary suspend tells the operator it is waiting to resume', () => {
    const copy = suspendReasonCopy({ code: 'WORKFLOW_SUSPENDED' })
    assert.match(copy.title, /resume/i)
    assert.doesNotMatch(copy.title, /error|fail/i)
  })
})

describe('suspendReasonText', () => {
  test('passes a string message through', () => {
    assert.equal(
      suspendReasonText({ message: 'Needs approval' }),
      'Needs approval'
    )
  })

  test('survives a non-string message', () => {
    assert.equal(
      suspendReasonText({ message: { nested: true } }),
      JSON.stringify({ nested: true }, null, 2)
    )
  })

  test('is empty with no error', () => {
    assert.equal(suspendReasonText(undefined), '')
  })
})
