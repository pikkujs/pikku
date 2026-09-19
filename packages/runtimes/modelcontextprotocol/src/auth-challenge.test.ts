import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { addFunction } from '@pikku/core/function'

import { PikkuMCPServer } from './index.js'

/**
 * A refused call is advertised as a refusal, not reported as a failed tool.
 *
 * The runner's refusal used to arrive as a `200` carrying `isError`, which a
 * client reads as a tool that broke rather than one it has not authenticated
 * for, so OAuth discovery never began.
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

const initialize = (
  handler: (request: Request) => Promise<Response>,
  headers: Record<string, string> = {}
) =>
  handler(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
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

const startServer = async ({ open = true }: { open?: boolean } = {}) => {
  if (open) {
    registerTool('publicTool', false)
  }
  registerTool('privateTool', true)

  const server = new PikkuMCPServer(
    {
      name: 'test',
      version: '1.0.0',
      mcpJSON: {
        tools: open
          ? [{ name: 'publicTool' }, { name: 'privateTool' }]
          : [{ name: 'privateTool' }],
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

/**
 * See `the-mcp-handshake-is-challenged-only-when-every-target-is-gated.md`.
 */
describe('the handshake tells a client whether there is a sign-in at all', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
  })

  test('a fully gated server challenges initialize', async () => {
    const server = await startServer({ open: false })
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const response = await initialize(handler)

    assert.equal(response.status, 401)
    assert.match(
      response.headers.get('WWW-Authenticate') ?? '',
      /resource_metadata="http:\/\/localhost\/\.well-known\/oauth-protected-resource\/mcp"/
    )

    await server.stop()
  })

  test('a server with one open target completes initialize unauthenticated', async () => {
    const server = await startServer({ open: true })
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const response = await initialize(handler)

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('WWW-Authenticate'), null)

    await server.stop()
  })
})

/**
 * See `the-advertised-resource-url-comes-from-the-forwarded-origin.md`.
 */
describe('the advertised origin is the one the client reached', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
  })

  const forwarded = {
    // A chain appends, so the client's own view is first and the hops that
    // carried it follow. Reading the last entry would advertise the proxy.
    'x-forwarded-proto': 'https, http',
    'x-forwarded-host': 'fabric.example.com, internal.lan:8080',
  }

  test('the challenge points at the forwarded origin, not the internal one', async () => {
    const server = await startServer({ open: false })
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const response = await initialize(handler, forwarded)

    assert.equal(response.status, 401)
    assert.match(
      response.headers.get('WWW-Authenticate') ?? '',
      /resource_metadata="https:\/\/fabric\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/
    )

    await server.stop()
  })

  test('the protected resource metadata does too', async () => {
    const server = await startServer()
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const response = await handler(
      new Request(
        'http://internal.lan:8080/.well-known/oauth-protected-resource/mcp',
        { headers: forwarded }
      )
    )

    assert.equal(response.status, 200)
    const body = (await response.json()) as { resource: string }
    assert.equal(body.resource, 'https://fabric.example.com/mcp')

    await server.stop()
  })
})
