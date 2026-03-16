import { describe, it, expect } from 'vitest'
import { serializePublicAgent } from './serialize-public-agent.js'

describe('serializePublicAgent', () => {
  it('should generate routes without prefix by default', () => {
    const result = serializePublicAgent('#pikku', true)
    expect(result).toContain("route: '/rpc/agent/:agentName'")
    expect(result).toContain("route: '/rpc/agent/:agentName/stream'")
    expect(result).toContain("route: '/rpc/agent/:agentName/approve'")
    expect(result).toContain("route: '/rpc/agent/:agentName/resume'")
  })

  it('should generate routes with empty string prefix', () => {
    const result = serializePublicAgent('#pikku', true, '')
    expect(result).toContain("route: '/rpc/agent/:agentName'")
    expect(result).toContain("route: '/rpc/agent/:agentName/stream'")
  })

  it('should generate routes with globalHTTPPrefix', () => {
    const result = serializePublicAgent('#pikku', true, '/api')
    expect(result).toContain("route: '/api/rpc/agent/:agentName'")
    expect(result).toContain("route: '/api/rpc/agent/:agentName/stream'")
    expect(result).toContain("route: '/api/rpc/agent/:agentName/approve'")
    expect(result).toContain("route: '/api/rpc/agent/:agentName/resume'")
  })

  it('should set auth flag correctly', () => {
    const authResult = serializePublicAgent('#pikku', true, '')
    expect(authResult).toContain('auth: true')

    const noAuthResult = serializePublicAgent('#pikku', false, '')
    expect(noAuthResult).toContain('auth: false')
  })
})
