import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { addFunction } from '@pikku/core/function'

import { PikkuMCPServer } from './index.js'

/**
 * A refused call is advertised as a refusal, not reported as a failed tool.
 *
 * Pikku already knows tool by tool which calls need a session — a
 * `pikkuSessionlessFunc` is public, and one declaring `auth: true` is not — so
 * the endpoint is never gated as a whole. What was missing is that the runner's
 * refusal arrived as a `200` carrying `isError`, which a client reads as a tool
 * that broke rather than one it has not authenticated for, so OAuth discovery
 * never began.
 */
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const callTool = (
  handler: (request: Request) => Promise<Response>,
  name: string
) =>
  handler(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: {} },
      }),
    })
  )

const registerTool = (name: string, auth: boolean) => {
  pikkuState(null, 'mcp', 'toolsMeta')[name] = {
    name,
    title: name,
    description: name,
    pikkuFuncId: `${name}Func`,
    inputSchema: null,
    outputSchema: 'MCPToolResponse',
  } as never
  addFunction(
    `${name}Func`,
    { auth, func: async () => [{ type: 'text', text: 'ok' }] } as never,
    null
  )
  pikkuState(null, 'function', 'meta')[`${name}Func`] = {
    name: `${name}Func`,
    sessionless: true,
    auth,
    permissions: [],
  } as never
}

const startServer = async () => {
  registerTool('publicTool', false)
  registerTool('privateTool', true)

  const server = new PikkuMCPServer(
    {
      name: 'test',
      version: '1.0.0',
      mcpJSON: {
        tools: [{ name: 'publicTool' }, { name: 'privateTool' }],
        resources: [],
        prompts: [],
      },
      capabilities: { tools: {} },
    } as never,
    logger as never
  )
  await server.init()
  return server
}

describe('an unauthenticated MCP call is challenged, not flattened', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
  })

  test('a tool declaring auth: true answers 401 with a bearer challenge', async () => {
    const server = await startServer()
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const response = await callTool(handler, 'privateTool')

    assert.equal(response.status, 401)
    const challenge = response.headers.get('WWW-Authenticate') ?? ''
    assert.match(challenge, /^Bearer/)
    assert.match(
      challenge,
      /resource_metadata="http:\/\/localhost\/\.well-known\/oauth-protected-resource\/mcp"/
    )

    await server.stop()
  })

  test('a public tool in the same server is untouched', async () => {
    const server = await startServer()
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const response = await callTool(handler, 'publicTool')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('WWW-Authenticate'), null)

    await server.stop()
  })

  test('the protected resource metadata names this endpoint and its issuer', async () => {
    const server = await startServer()
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const response = await handler(
      new Request('http://localhost/.well-known/oauth-protected-resource/mcp')
    )

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      resource: 'http://localhost/mcp',
      authorization_servers: ['http://localhost/'],
      bearer_methods_supported: ['header'],
    })

    await server.stop()
  })

  test('an app can name the authorization server that actually mints its tokens', async () => {
    const server = await startServer()
    const { handler } = server.createFetchHandler({
      path: '/mcp',
      auth: {
        authorizationServers: ['https://auth.example.com'],
        scopesSupported: ['mcp'],
        resourceName: 'Backbone',
      },
    })

    const response = await handler(
      new Request('http://localhost/.well-known/oauth-protected-resource/mcp')
    )

    assert.deepEqual(await response.json(), {
      resource: 'http://localhost/mcp',
      authorization_servers: ['https://auth.example.com'],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp'],
      resource_name: 'Backbone',
    })

    await server.stop()
  })
})
