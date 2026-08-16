import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { addFunction } from '@pikku/core/function'
import { addGlobalMiddleware } from '@pikku/core/middleware'

import { PikkuMCPServer } from './index.js'

/**
 * The node transport half of "MCP carries a user session".
 *
 * `fetch-session.test.ts` covers the web-standard handler. The node handler is
 * an adapter over it, and the thing worth proving is that the adaptation does
 * not lose the caller on the way through — the headers have to survive being
 * turned into a `Request`, and the response has to survive being written back
 * out. That only shows up over a real socket, so this drives one.
 */
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const logs: unknown[][] = []
const capturingLogger = {
  ...logger,
  error: (...args: unknown[]) => logs.push(args),
}

const callTool = async (
  url: string,
  name: string,
  headers: Record<string, string> = {}
) => {
  const response = await fetch(url, {
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
  const body = await response.text()
  const frame = body.split('\n').find((line) => line.startsWith('data:'))
  return {
    status: response.status,
    message: JSON.parse((frame ?? body).replace(/^data:\s*/, '')),
  }
}

const registerWhoami = () => {
  addGlobalMiddleware([
    async (_services: any, wire: any, next: any) => {
      if (wire.http?.request?.header('authorization') === 'Bearer token-abc') {
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
}

const startServer = async (log: typeof logger = logger) => {
  const mcp = new PikkuMCPServer(
    {
      name: 'test',
      version: '1.0.0',
      mcpJSON: { tools: [{ name: 'whoami' }], resources: [], prompts: [] },
      capabilities: { tools: {} },
    } as never,
    log as never
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
    close: () =>
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
  }
}

describe('the node HTTP handler carries the caller through to the tool', () => {
  beforeEach(() => {
    logs.length = 0
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
  })

  test('a session-requiring tool sees the session the request implies', async () => {
    registerWhoami()
    const { url, close } = await startServer()
    try {
      const authorized = await callTool(url, 'whoami', {
        Authorization: 'Bearer token-abc',
      })
      assert.deepEqual(authorized.message.result?.content, [
        { type: 'text', text: 'usr_1' },
      ])

      // The same assertion the fetch test makes, repeated here because the node
      // path used to reach a different dispatch: a call that authenticated
      // nothing must be refused rather than inherit the last caller.
      const anonymous = await callTool(url, 'whoami')
      const refusal = JSON.stringify(
        anonymous.message.result?.content ?? anonymous.message
      )
      assert.match(refusal, /Authentication required/)
      assert.ok(!refusal.includes('usr_1'))
    } finally {
      await close()
    }
  })

  test('a path that is not the MCP one is a 404, not a tool call', async () => {
    registerWhoami()
    const { url, close } = await startServer()
    try {
      const response = await fetch(url.replace('/mcp', '/elsewhere'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      assert.equal(response.status, 404)
    } finally {
      await close()
    }
  })

  test('a malformed body is refused without the handler falling over', async () => {
    registerWhoami()
    const { url, close } = await startServer(capturingLogger)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: 'not json',
      })
      assert.ok(
        response.status >= 400 && response.status < 500,
        `expected a client error, got ${response.status}`
      )
      assert.deepEqual(logs, [], 'a bad request is not a handler crash')
    } finally {
      await close()
    }
  })
})
