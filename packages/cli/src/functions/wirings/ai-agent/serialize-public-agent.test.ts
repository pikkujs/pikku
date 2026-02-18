import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { serializePublicAgent } from './serialize-public-agent.js'

describe('serializePublicAgent', () => {
  test('defaults generated public agent routes to auth enabled', () => {
    const serialized = serializePublicAgent('#pikku')
    assert.doesNotMatch(serialized, /auth:\s*false/)
    assert.match(serialized, /auth:\s*true/)
    const publicTagMatches = serialized.match(/tags:\s*\['pikku:public'\]/g)
    assert.equal(publicTagMatches?.length, 5)
  })

  test('supports explicitly generating public unauthenticated routes', () => {
    const serialized = serializePublicAgent('#pikku', false)
    assert.match(serialized, /auth:\s*false/)
  })

  test('guards missing aiRunState before approveAIAgent call', () => {
    const serialized = serializePublicAgent('#pikku')

    assert.match(
      serialized,
      /if \(!aiRunState\)\s*{\s*throw new Error\('AIRunStateService not available'\)/
    )
    assert.match(
      serialized,
      /approveAIAgent\(aiRunState, runId, approvals, agentName\)/
    )
    assert.doesNotMatch(
      serialized,
      /approveAIAgent\(aiRunState!, runId, approvals\)/
    )
  })
})
