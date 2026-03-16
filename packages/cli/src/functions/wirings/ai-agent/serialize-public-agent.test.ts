import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializePublicAgent } from './serialize-public-agent.js'

describe('serializePublicAgent', () => {
  test('should generate routes without prefix by default', () => {
    const result = serializePublicAgent('#pikku', true)
    assert.ok(result.includes("route: '/rpc/agent/:agentName'"))
    assert.ok(result.includes("route: '/rpc/agent/:agentName/stream'"))
    assert.ok(result.includes("route: '/rpc/agent/:agentName/approve'"))
    assert.ok(result.includes("route: '/rpc/agent/:agentName/resume'"))
  })

  test('should generate routes with empty string prefix', () => {
    const result = serializePublicAgent('#pikku', true, '')
    assert.ok(result.includes("route: '/rpc/agent/:agentName'"))
    assert.ok(result.includes("route: '/rpc/agent/:agentName/stream'"))
  })

  test('should generate routes with globalHTTPPrefix', () => {
    const result = serializePublicAgent('#pikku', true, '/api')
    assert.ok(result.includes("route: '/api/rpc/agent/:agentName'"))
    assert.ok(result.includes("route: '/api/rpc/agent/:agentName/stream'"))
    assert.ok(result.includes("route: '/api/rpc/agent/:agentName/approve'"))
    assert.ok(result.includes("route: '/api/rpc/agent/:agentName/resume'"))
  })

  test('should set auth flag correctly', () => {
    const authResult = serializePublicAgent('#pikku', true, '')
    assert.ok(authResult.includes('auth: true'))

    const noAuthResult = serializePublicAgent('#pikku', false, '')
    assert.ok(noAuthResult.includes('auth: false'))
  })
})
