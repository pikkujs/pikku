import { describe, it, expect } from 'vitest'
import { serializePublicRPC } from './serialize-public-rpc.js'

describe('serializePublicRPC', () => {
  it('should generate routes without prefix by default', () => {
    const result = serializePublicRPC('#pikku', true)
    expect(result).toContain("route: '/rpc/:rpcName'")
    expect(result).toContain("route: '/rpc/workflow/:workflowName'")
  })

  it('should generate routes with empty string prefix', () => {
    const result = serializePublicRPC('#pikku', true, '')
    expect(result).toContain("route: '/rpc/:rpcName'")
    expect(result).toContain("route: '/rpc/workflow/:workflowName'")
  })

  it('should generate routes with globalHTTPPrefix', () => {
    const result = serializePublicRPC('#pikku', true, '/api')
    expect(result).toContain("route: '/api/rpc/:rpcName'")
    expect(result).toContain("route: '/api/rpc/workflow/:workflowName'")
  })

  it('should set auth flag correctly', () => {
    const authResult = serializePublicRPC('#pikku', true, '')
    expect(authResult).toContain('auth: true')

    const noAuthResult = serializePublicRPC('#pikku', false, '')
    expect(noAuthResult).toContain('auth: false')
  })
})
