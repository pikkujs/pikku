import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/ecosystem'
import { addFunction } from '@pikku/core/ecosystem/function'
import { addGlobalMiddleware } from '@pikku/core/ecosystem/middleware'

import { PikkuMCPServer } from './index.js'

/**
 * The transport half of "MCP carries a user session".
 *
 * `runMCPTool` accepting an `http` is not enough on its own — the fetch handler
 * has always received the caller's `Request` and thrown it away, so nothing
 * downstream could see a cookie or an Authorization header. This drives a real
 * `tools/call` through the handler and asserts the tool saw the caller.
 */
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const callTool = async (
  handler: (request: Request) => Promise<Response>,
  name: string,
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
        params: { name, arguments: {} },
      }),
    })
  )
  const body = await response.text()
  const frame = body.split('\n').find((line) => line.startsWith('data:'))
  return JSON.parse((frame ?? body).replace(/^data:\s*/, ''))
}

describe('createFetchHandler carries the caller through to the tool', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
  })

  test('a session-requiring tool sees the session its request implies', async () => {
    addGlobalMiddleware([
      async (_services: any, wire: any, next: any) => {
        if (
          wire.http?.request?.header('authorization') === 'Bearer token-abc'
        ) {
          wire.setSession?.({ userId: 'usr_1' })
        }
        await next()
      },
    ] as never)

    pikkuState(null, 'mcp', 'toolsMeta').whoami = {
      name: 'whoami',
      title: 'Who am I',
      description: 'Who am I',
      pikkuFuncId: 'whoamiFunc',
      inputSchema: null,
      outputSchema: 'MCPToolResponse',
    } as never
    addFunction(
      'whoamiFunc',
      {
        func: async (_services: any, _data: any, wire: any) => [
          { type: 'text', text: wire.session?.userId ?? 'anonymous' },
        ],
      } as never,
      null
    )
    pikkuState(null, 'function', 'meta').whoamiFunc = {
      name: 'whoamiFunc',
      sessionless: false,
      permissions: [],
    } as never

    const server = new PikkuMCPServer(
      {
        name: 'test',
        version: '1.0.0',
        mcpJSON: { tools: [{ name: 'whoami' }], resources: [], prompts: [] },
        capabilities: { tools: {} },
      } as never,
      logger as never
    )
    await server.init()
    const { handler } = server.createFetchHandler({ path: '/mcp' })

    const authorized = await callTool(handler, 'whoami', {
      Authorization: 'Bearer token-abc',
    })
    assert.deepEqual(authorized.result?.content, [
      { type: 'text', text: 'usr_1' },
    ])

    // And an unauthenticated call must be refused rather than inheriting the
    // previous caller's session. Two things are being asserted at once: that a
    // session-requiring tool now actually requires one — which it could not do
    // before, having never had a request to derive it from — and that the
    // per-request server does not leak the last caller's session to the next.
    const anonymous = await callTool(handler, 'whoami')
    const refusal = JSON.stringify(anonymous.result?.content ?? anonymous)
    assert.match(refusal, /Authentication required/)
    assert.ok(
      !refusal.includes('usr_1'),
      "an anonymous call must not see the previous caller's session"
    )
  })
})
