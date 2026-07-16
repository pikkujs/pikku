import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { statusDefs } from './badge-defs.js'

describe('statusDefs', () => {
  test('covers every WorkflowStatus core can persist', () => {
    // Mirrors WorkflowStatus in @pikku/core (workflow.types.ts). A status with no
    // entry silently falls back to a gray badge labelled by humanize(), which is
    // how 'suspended' went unnoticed.
    for (const status of [
      'running',
      'suspended',
      'completed',
      'failed',
      'cancelled',
    ]) {
      assert.ok(
        statusDefs[status],
        `statusDefs is missing '${status}' — it will render as an unstyled gray badge`
      )
    }
  })

  test('suspended is not styled as a failure', () => {
    assert.notEqual(
      statusDefs.suspended?.color,
      'red',
      'a run waiting on a human has not failed'
    )
  })

  test('suspended matches the yellow used by the canvas and timeline', () => {
    // FlowNode.tsx and WorkflowTimelineDrawer.tsx already colour suspended
    // yellow; the badge should agree rather than invent a third convention.
    assert.equal(statusDefs.suspended?.color, 'yellow')
  })
})
