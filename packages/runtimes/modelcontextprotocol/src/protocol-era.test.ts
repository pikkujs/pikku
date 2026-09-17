import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from '@modelcontextprotocol/server'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { addFunction } from '@pikku/core/function'

import { PikkuMCPServer } from './index.js'

/**
 * Both protocol eras reach the same tool.
 *
 * The v2 SDK routes a request carrying the per-request `_meta` envelope down
 * its modern path and everything else down a stateless legacy fallback. Pikku
 * registers its tools once, so the thing worth proving is that one
 * registration answers both — a client on either era has to get the same tool,
 * not a `Method not found` from whichever leg went unregistered.
 */
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const callTool = async (
  handler: (request: Request) => Promise<Response>,
  params: Record<string, unknown>,
  headers: Record<string, string> = {}
) => {
  const response = await handler(
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
        method: 'tools/call',
        params,
      }),
    })
  )
  const body = await response.text()
  const frame = body.split('\n').find((line) => line.startsWith('data:'))
  return {
    status: response.status,
    message: JSON.parse((frame ?? body).replace(/^data:\s*/, '')),
  }
}

/**
 * The `_meta` envelope that puts a request on the modern path.
 *
 * The revision is spelled out because the SDK exports no constant for it:
 * `LATEST_PROTOCOL_VERSION` is the newest version the *legacy* handshake can
 * negotiate, and naming it here is what produced a `-32022` rather than a tool
 * result.
 */
const MODERN_PROTOCOL_VERSION = '2026-07-28'

const modernEnvelope = {
  [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
  [CLIENT_INFO_META_KEY]: { name: 'era-test', version: '1.0.0' },
  [CLIENT_CAPABILITIES_META_KEY]: {},
}

const startServer = async () => {
  pikkuState(null, 'mcp', 'toolsMeta').ping = {
    name: 'ping',
    title: 'Ping',
    description: 'Ping',
    pikkuFuncId: 'pingFunc',
    inputSchema: null,
    outputSchema: 'MCPToolResponse',
  } as never
  addFunction(
    'pingFunc',
    { func: async () => [{ type: 'text', text: 'pong' }] } as never,
    null
  )
  pikkuState(null, 'function', 'meta').pingFunc = {
    name: 'pingFunc',
    sessionless: true,
    permissions: [],
  } as never

  const server = new PikkuMCPServer(
    {
      name: 'test',
      version: '1.0.0',
      mcpJSON: { tools: [{ name: 'ping' }], resources: [], prompts: [] },
      capabilities: { tools: {} },
    } as never,
    logger as never
  )
  await server.init()
  return server
}

describe('the fetch handler serves both protocol eras', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
  })

  test('a legacy (envelope-less) call reaches the tool', async () => {
    const server = await startServer()
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const { message } = await callTool(handler, {
      name: 'ping',
      arguments: {},
    })
    assert.deepEqual(message.result?.content, [{ type: 'text', text: 'pong' }])

    await server.stop()
  })

  test('a modern (enveloped) call reaches the same tool', async () => {
    const server = await startServer()
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const { message } = await callTool(
      handler,
      {
        name: 'ping',
        arguments: {},
        _meta: modernEnvelope,
      },
      {
        'Mcp-Method': 'tools/call',
        'Mcp-Name': 'ping',
        'MCP-Protocol-Version': MODERN_PROTOCOL_VERSION,
      }
    )
    assert.deepEqual(
      message.result?.content,
      [{ type: 'text', text: 'pong' }],
      JSON.stringify(message)
    )

    await server.stop()
  })

  test('a request off the mounted path is not served', async () => {
    const server = await startServer()
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const response = await handler(
      new Request('http://localhost/elsewhere', { method: 'POST' })
    )
    assert.equal(response.status, 404)

    await server.stop()
  })
})
