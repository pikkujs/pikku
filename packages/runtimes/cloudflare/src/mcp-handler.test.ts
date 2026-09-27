import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { addFunction } from '@pikku/core/function'
import { pikkuState, resetPikkuState } from '@pikku/core/state'

// Type-only, so it is erased before runtime and does not load the module ahead
// of the `cloudflare:workers` stub registered below.
import type { createCloudflareMCPHandler as CreateCloudflareMCPHandler } from './mcp-handler.js'

class WorkerEntrypointStub {
  constructor(
    readonly ctx: unknown,
    readonly env: unknown
  ) {}
}

// `cloudflare:workers` only exists inside the workerd runtime, and the handler
// imports `WorkerEntrypoint` from it at module scope. Stubbing the specifier
// first is what lets the real fetch() routing run outside workerd.
if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
  const { mock } = await import('bun:test')
  mock.module('cloudflare:workers', () => ({
    WorkerEntrypoint: WorkerEntrypointStub,
  }))
} else {
  const { registerHooks } = await import('node:module')
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'cloudflare:workers') {
        return {
          url: 'data:text/javascript,export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env } }',
          shortCircuit: true,
        }
      }
      return nextResolve(specifier, context)
    },
  })
}

let createCloudflareMCPHandler: typeof CreateCloudflareMCPHandler

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  setLevel: () => {},
}

const factories = {
  createConfig: async () => ({}),
  createSingletonServices: async () => ({ logger: silentLogger }) as any,
}

const TOOL_SURFACE = {
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
}

/** Registers the tool as an ordinary pikku function, the way a unit's bootstrap does. */
const wireTool = (received: unknown[]) => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: silentLogger,
  } as never)
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
}

/** One JSON-RPC message through the worker's own fetch(), unwrapping either framing. */
const rpc = async (
  worker: { fetch: (request: Request) => Promise<Response> },
  body: unknown
): Promise<any> => {
  const response = await worker.fetch(
    new Request('https://unit.example.com/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    })
  )
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

describe('a cloudflare MCP unit serves the surface it was deployed with', () => {
  before(async () => {
    ;({ createCloudflareMCPHandler } = await import('./mcp-handler.js'))
  })

  test('tools/call reaches the pikku function through the worker fetch', async () => {
    const received: unknown[] = []
    wireTool(received)

    const Worker = createCloudflareMCPHandler(factories as never, {
      mcpJson: TOOL_SURFACE,
    })
    const worker = new Worker({} as any, {} as any)

    const initialized = await rpc(worker, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'pikku-cf-e2e', version: '0.0.0' },
      },
    })
    assert.equal(initialized?.result?.serverInfo?.name, 'pikku')

    const listed = await rpc(worker, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })
    assert.deepEqual(
      (listed?.result?.tools ?? []).map((t: any) => t.name),
      ['getAvailability']
    )

    const called = await rpc(worker, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'getAvailability', arguments: { venueSlug: 'drawehn' } },
    })

    assert.deepEqual(received, [{ venueSlug: 'drawehn' }])
    assert.equal(called?.result?.isError, false)
    assert.equal(
      called?.result?.content?.[0]?.text,
      '{"days":[{"date":"2026-09-19","status":"free"}]}'
    )
  })

  test('a custom mcpPath moves the endpoint', async () => {
    const received: unknown[] = []
    wireTool(received)

    const Worker = createCloudflareMCPHandler(factories as never, {
      mcpJson: TOOL_SURFACE,
      mcpPath: '/connectors/weather',
    })
    const worker = new Worker({} as any, {} as any)

    const atDefault = await worker.fetch(
      new Request('https://unit.example.com/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    )
    assert.notEqual(
      atDefault.status,
      200,
      '/mcp must not answer when the surface was mounted elsewhere'
    )

    const response = await worker.fetch(
      new Request('https://unit.example.com/connectors/weather', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'pikku-cf-e2e', version: '0.0.0' },
          },
        }),
      })
    )
    assert.equal(response.status, 200)
  })

  test('an empty surface mounts nothing and the request falls through', async () => {
    const received: unknown[] = []
    wireTool(received)

    const Worker = createCloudflareMCPHandler(factories as never, {
      mcpJson: { tools: [], resources: [], prompts: [] },
    })
    const worker = new Worker({} as any, {} as any)

    const response = await worker.fetch(
      new Request('https://unit.example.com/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      })
    )

    // Whatever the unit's own HTTP routing answers, it is not a JSON-RPC reply:
    // nothing was mounted, so no MCP server ever saw this.
    const text = await response.text()
    assert.equal(text.includes('"jsonrpc"'), false, text.slice(0, 200))
  })
})
