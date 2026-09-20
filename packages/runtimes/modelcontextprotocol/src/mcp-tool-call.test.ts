import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { afterEach, describe, test } from 'node:test'
import type { AddressInfo } from 'node:net'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { addFunction } from '@pikku/core/function'

import { PikkuMCPServer } from './pikku-mcp-server.js'

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  setLevel: () => {},
}

/**
 * One JSON-RPC message over the wire, unwrapping whichever framing the
 * transport chose — a plain JSON body, or a one-event SSE stream.
 */
const rpc = async (origin: string, body: unknown): Promise<any> => {
  const response = await fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      connection: 'close',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  assert.equal(
    response.status,
    200,
    `expected 200 from /mcp, got ${response.status}: ${text.slice(0, 200)}`
  )
  if (!text) return undefined
  if (
    (response.headers.get('content-type') ?? '').includes('text/event-stream')
  ) {
    const line = text.split('\n').find((l) => l.startsWith('data:'))
    return line ? JSON.parse(line.slice('data:'.length).trim()) : undefined
  }
  return JSON.parse(text)
}

describe('an MCP tool runs over the HTTP endpoint', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
    resetPikkuState()
  })

  test('tools/list advertises the wired tool and tools/call executes it', async () => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      logger: silentLogger,
    } as never)

    // The tool is an ordinary pikku function reached by its id, exactly as a
    // deployed unit reaches it — nothing here stands in for the runner.
    const received: unknown[] = []
    addFunction(
      'getAvailabilityFunc',
      {
        func: async (_services: any, data: any) => {
          received.push(data)
          return { days: [{ date: '2026-09-19', status: 'free' }] }
        },
      } as never,
      null
    )
    pikkuState(null, 'function', 'meta').getAvailabilityFunc = {
      name: 'getAvailabilityFunc',
      sessionless: true,
      permissions: [],
    } as never
    pikkuState(null, 'mcp', 'toolsMeta').getAvailability = {
      name: 'getAvailability',
      title: 'Get availability',
      description: 'Public availability calendar.',
      pikkuFuncId: 'getAvailabilityFunc',
      inputSchema: null,
      outputSchema: null,
    } as never

    const mcp = new PikkuMCPServer(
      {
        name: 'pikku',
        version: '1.0.0',
        mcpJSON: {
          tools: [
            {
              name: 'getAvailability',
              description: 'Public availability calendar.',
              parameters: {
                type: 'object',
                properties: { venueSlug: { type: 'string' } },
              },
            },
          ],
        },
        capabilities: { tools: {} },
      } as never,
      silentLogger as never
    )
    await mcp.init()

    const { handler } = mcp.createHTTPRequestHandler({ path: '/mcp' })
    server = createServer((req, res) => {
      void handler(req, res)
    })
    await new Promise<void>((resolve) =>
      server!.listen(0, '127.0.0.1', () => resolve())
    )
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const initialized = await rpc(origin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'pikku-e2e', version: '0.0.0' },
      },
    })
    assert.equal(initialized?.result?.serverInfo?.name, 'pikku')

    const listed = await rpc(origin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })
    assert.deepEqual(
      (listed?.result?.tools ?? []).map((t: any) => t.name),
      ['getAvailability']
    )

    const called = await rpc(origin, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'getAvailability',
        arguments: { venueSlug: 'drawehn' },
      },
    })

    // The function ran with the arguments the client sent, and what it
    // returned came back through the transport rather than an empty ack.
    assert.deepEqual(received, [{ venueSlug: 'drawehn' }])
    assert.equal(called?.result?.isError, false)
    assert.equal(
      called?.result?.content?.[0]?.text,
      '{"days":[{"date":"2026-09-19","status":"free"}]}'
    )
  })
})
