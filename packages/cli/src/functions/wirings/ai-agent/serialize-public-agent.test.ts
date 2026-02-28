import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { serializePublicAgent } from './serialize-public-agent.js'

describe('serializePublicAgent', () => {
  test('defaults generated public agent routes to auth enabled', () => {
    const serialized = serializePublicAgent('#pikku')
    assert.doesNotMatch(serialized, /auth:\s*false/)
    assert.match(serialized, /auth:\s*true/)
    assert.match(serialized, /tags:\s*\['pikku:public'\]/g)
  })

  test('supports explicitly generating public unauthenticated routes', () => {
    const serialized = serializePublicAgent('#pikku', false)
    assert.match(serialized, /auth:\s*false/)
  })

  test('approve caller delegates to rpc.agent.approve', () => {
    const serialized = serializePublicAgent('#pikku')

    assert.match(
      serialized,
      /rpc\.agent\.approve\(runId, approvals, agentName\)/
    )
  })
})
