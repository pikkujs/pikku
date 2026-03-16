import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializePublicRPC } from './serialize-public-rpc.js'

describe('serializePublicRPC', () => {
  test('should generate routes without prefix by default', () => {
    const result = serializePublicRPC('#pikku', true)
    assert.ok(result.includes("route: '/rpc/:rpcName'"))
    assert.ok(result.includes("route: '/rpc/workflow/:workflowName'"))
  })

  test('should generate routes with empty string prefix', () => {
    const result = serializePublicRPC('#pikku', true, '')
    assert.ok(result.includes("route: '/rpc/:rpcName'"))
    assert.ok(result.includes("route: '/rpc/workflow/:workflowName'"))
  })

  test('should generate routes with globalHTTPPrefix', () => {
    const result = serializePublicRPC('#pikku', true, '/api')
    assert.ok(result.includes("route: '/api/rpc/:rpcName'"))
    assert.ok(result.includes("route: '/api/rpc/workflow/:workflowName'"))
  })

  test('should set auth flag correctly', () => {
    const authResult = serializePublicRPC('#pikku', true, '')
    assert.ok(authResult.includes('auth: true'))

    const noAuthResult = serializePublicRPC('#pikku', false, '')
    assert.ok(noAuthResult.includes('auth: false'))
  })
})
