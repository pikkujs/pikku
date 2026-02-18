import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { serializePublicAgent } from './serialize-public-agent.js'

describe('serializePublicAgent', () => {
  test('guards missing aiRunState before approveAIAgent call', () => {
    const serialized = serializePublicAgent('#pikku')

    assert.match(
      serialized,
      /if \(!aiRunState\)\s*{\s*throw new Error\('AIRunStateService not available'\)/
    )
    assert.match(serialized, /approveAIAgent\(aiRunState, runId, approvals\)/)
    assert.doesNotMatch(
      serialized,
      /approveAIAgent\(aiRunState!, runId, approvals\)/
    )
  })
})
