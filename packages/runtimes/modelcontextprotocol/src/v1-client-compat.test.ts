import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, test } from 'node:test'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { addFunction } from '@pikku/core/function'

import { PikkuMCPServer } from './index.js'

/**
 * A v1 MCP client still reaches a v2 server.
 *
 * The server runtime moved from `@modelcontextprotocol/sdk` to
 * `@modelcontextprotocol/server`, whose modern path refuses anything without
 * the per-request `_meta` envelope — which no v1 client sends. What keeps them
 * working is the entry's stateless legacy fallback, and that is a default
 * rather than something pikku asks for, so it is worth pinning: a v1 client is
 * what `examples/online-shop` drives the MCP scenario with, and what anyone
 * running an older Claude Desktop has.
 *
 * The whole v1 flow is exercised, not just a tool call — `connect` performs
 * `initialize`, and `close` issues the session DELETE that a stateless
 * endpoint has no session for.
 */
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const startServer = async () => {
  pikkuState(null, 'mcp', 'toolsMeta').greet = {
    name: 'greet',
    title: 'Greet',
    description: 'Greet the caller',
    pikkuFuncId: 'greetFunc',
    inputSchema: null,
    outputSchema: 'MCPToolResponse',
  } as never
  addFunction(
    'greetFunc',
    { func: async () => [{ type: 'text', text: 'hello' }] } as never,
    null
  )
  pikkuState(null, 'function', 'meta').greetFunc = {
    name: 'greetFunc',
    sessionless: true,
    permissions: [],
  } as never

  const mcp = new PikkuMCPServer(
    {
      name: 'test',
      version: '1.0.0',
      mcpJSON: { tools: [{ name: 'greet' }], resources: [], prompts: [] },
      capabilities: { tools: {} },
    } as never,
    logger as never
  )
  await mcp.init()
  const { handler } = mcp.createHTTPRequestHandler({ path: '/mcp' })
  const httpServer = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolve) =>
    httpServer.listen(0, '127.0.0.1', resolve)
  )
  const { port } = httpServer.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    close: async () => {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()))
      await mcp.stop()
    },
  }
}

describe('a v1 MCP client still reaches the v2 server', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
  })

  test('initialize, tools/list and tools/call all succeed', async () => {
    const { url, close } = await startServer()
    const client = new Client(
      { name: 'v1-compat', version: '1.0.0' },
      { capabilities: {} }
    )

    try {
      // Throws if the server does not complete the v1 `initialize` handshake.
      await client.connect(new StreamableHTTPClientTransport(new URL(url)))

      const advertised = (await client.listTools()).tools.map((t) => t.name)
      assert.deepEqual(advertised, ['greet'])

      const result = (await client.callTool({
        name: 'greet',
        arguments: {},
      })) as { isError?: boolean; content?: Array<{ text?: string }> }
      assert.equal(result.isError, false)
      assert.deepEqual(result.content, [{ type: 'text', text: 'hello' }])
    } finally {
      await client.close().catch(() => {})
      await close()
    }
  })
})
