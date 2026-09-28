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
  if (!text) return undefined
  if (
    (response.headers.get('content-type') ?? '').includes('text/event-stream')
  ) {
    const line = text.split('\n').find((l) => l.startsWith('data:'))
    return line ? JSON.parse(line.slice('data:'.length).trim()) : undefined
  }
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Registers a tool the way a deployed unit reaches one: an ordinary pikku
 * function plus the process-wide MCP meta naming it.
 */
const registerTool = (toolName: string, funcId: string, answer: string) => {
  addFunction(funcId, { func: async () => ({ answer }) } as never, null)
  pikkuState(null, 'function', 'meta')[funcId] = {
    name: funcId,
    sessionless: true,
    permissions: [],
  } as never
  pikkuState(null, 'mcp', 'toolsMeta')[toolName] = {
    name: toolName,
    description: `${toolName} tool`,
    pikkuFuncId: funcId,
    inputSchema: null,
    outputSchema: null,
  } as never
}

describe('an MCP endpoint serves only the tools in its own manifest', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
    resetPikkuState()
  })

  /**
   * A project serving several connectors registers every connector's tools in
   * one process. Dispatch resolves a tool out of that process-wide registry, so
   * an endpoint that does not check its own manifest will run a tool belonging
   * to a different connector for any caller who knows its name — hidden by
   * tools/list and executed by tools/call.
   */
  test('a tool from another endpoint is listed nowhere and refused here', async () => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      logger: silentLogger,
    } as never)

    registerTool('weatherForecast', 'weatherForecastFunc', 'sunny')
    registerTool('calendarBook', 'calendarBookFunc', 'booked')

    // This server is the weather connector: its manifest names one tool, while
    // the calendar connector's tool is registered in the same process.
    const mcp = new PikkuMCPServer(
      {
        name: 'pikku',
        version: '1.0.0',
        mcpJSON: {
          tools: [
            {
              name: 'weatherForecast',
              description: 'weatherForecast tool',
              parameters: { type: 'object', properties: {} },
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

    await rpc(origin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'pikku-surface-test', version: '0.0.0' },
      },
    })

    const listed = await rpc(origin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    })
    assert.deepEqual(
      (listed?.result?.tools ?? []).map((t: any) => t.name),
      ['weatherForecast'],
      'the endpoint lists only its own tool'
    )

    const own = await rpc(origin, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'weatherForecast', arguments: {} },
    })
    assert.equal(
      JSON.stringify(own?.result ?? own).includes('sunny'),
      true,
      `its own tool runs: ${JSON.stringify(own).slice(0, 200)}`
    )

    const foreign = await rpc(origin, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'calendarBook', arguments: {} },
    })
    assert.equal(
      JSON.stringify(foreign).includes('booked'),
      false,
      `another endpoint's tool must not run here: ${JSON.stringify(foreign).slice(0, 200)}`
    )
    assert.equal(
      foreign?.error?.code,
      -32602,
      `another endpoint's tool must be refused: ${JSON.stringify(foreign).slice(0, 200)}`
    )
  })
})

/**
 * Registers a resource and a prompt the way a deployed unit reaches them: an
 * ordinary pikku function plus the process-wide MCP meta naming it.
 */
const registerResource = (uri: string, funcId: string, text: string) => {
  addFunction(
    funcId,
    { func: async () => [{ uri, mimeType: 'text/plain', text }] } as never,
    null
  )
  pikkuState(null, 'function', 'meta')[funcId] = {
    name: funcId,
    sessionless: true,
    permissions: [],
  } as never
  pikkuState(null, 'mcp', 'resourcesMeta')[uri] = {
    uri,
    title: uri,
    description: `${uri} resource`,
    mimeType: 'text/plain',
    pikkuFuncId: funcId,
    inputSchema: null,
  } as never
  pikkuState(null, 'mcp', 'resources').set(uri, { uri } as never)
}

const registerPrompt = (name: string, funcId: string, text: string) => {
  addFunction(
    funcId,
    {
      func: async () => [{ role: 'user', content: { type: 'text', text } }],
    } as never,
    null
  )
  pikkuState(null, 'function', 'meta')[funcId] = {
    name: funcId,
    sessionless: true,
    permissions: [],
  } as never
  pikkuState(null, 'mcp', 'promptsMeta')[name] = {
    name,
    description: `${name} prompt`,
    arguments: [],
    pikkuFuncId: funcId,
  } as never
  pikkuState(null, 'mcp', 'prompts').set(name, { name } as never)
}

describe('an MCP endpoint serves only the resources and prompts in its own manifest', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
    resetPikkuState()
  })

  /**
   * The same boundary `tools/call` draws, for the other two surfaces. These
   * listings read the process-wide meta rather than the endpoint's manifest,
   * so without scoping an endpoint advertises — and serves — a resource or
   * prompt belonging to a different connector.
   */
  test("another endpoint's resource and prompt are listed nowhere and refused here", async () => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      logger: silentLogger,
    } as never)

    registerResource('weather://today', 'weatherResourceFunc', 'sunny')
    registerResource('calendar://today', 'calendarResourceFunc', 'booked')
    registerPrompt('weatherBrief', 'weatherPromptFunc', 'brief the weather')
    registerPrompt('calendarBrief', 'calendarPromptFunc', 'brief the calendar')

    // The weather connector again: its manifest names one resource and one
    // prompt, while the calendar connector's live in the same process.
    const mcp = new PikkuMCPServer(
      {
        name: 'pikku',
        version: '1.0.0',
        mcpJSON: {
          tools: [],
          resources: [
            {
              name: 'weather://today',
              uri: 'weather://today',
              description: 'weather://today resource',
            },
          ],
          prompts: [
            { name: 'weatherBrief', description: 'weatherBrief prompt' },
          ],
        },
        capabilities: { resources: {}, prompts: {} },
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

    await rpc(origin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'pikku-surface-test', version: '0.0.0' },
      },
    })

    const resources = await rpc(origin, {
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/list',
      params: {},
    })
    assert.deepEqual(
      (resources?.result?.resources ?? []).map((r: any) => r.uri),
      ['weather://today'],
      'the endpoint lists only its own resource'
    )

    const prompts = await rpc(origin, {
      jsonrpc: '2.0',
      id: 3,
      method: 'prompts/list',
      params: {},
    })
    assert.deepEqual(
      (prompts?.result?.prompts ?? []).map((p: any) => p.name),
      ['weatherBrief'],
      'the endpoint lists only its own prompt'
    )

    const ownResource = await rpc(origin, {
      jsonrpc: '2.0',
      id: 4,
      method: 'resources/read',
      params: { uri: 'weather://today' },
    })
    assert.equal(
      JSON.stringify(ownResource?.result ?? ownResource).includes('sunny'),
      true,
      `its own resource reads: ${JSON.stringify(ownResource).slice(0, 200)}`
    )

    const foreignResource = await rpc(origin, {
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/read',
      params: { uri: 'calendar://today' },
    })
    assert.equal(
      JSON.stringify(foreignResource).includes('booked'),
      false,
      `another endpoint's resource must not be read here: ${JSON.stringify(foreignResource).slice(0, 200)}`
    )
    assert.equal(
      foreignResource?.error?.code,
      -32602,
      `another endpoint's resource must be refused: ${JSON.stringify(foreignResource).slice(0, 200)}`
    )

    const ownPrompt = await rpc(origin, {
      jsonrpc: '2.0',
      id: 6,
      method: 'prompts/get',
      params: { name: 'weatherBrief', arguments: {} },
    })
    assert.equal(
      JSON.stringify(ownPrompt?.result ?? ownPrompt).includes(
        'brief the weather'
      ),
      true,
      `its own prompt runs: ${JSON.stringify(ownPrompt).slice(0, 200)}`
    )

    const foreignPrompt = await rpc(origin, {
      jsonrpc: '2.0',
      id: 7,
      method: 'prompts/get',
      params: { name: 'calendarBrief', arguments: {} },
    })
    assert.equal(
      JSON.stringify(foreignPrompt).includes('brief the calendar'),
      false,
      `another endpoint's prompt must not run here: ${JSON.stringify(foreignPrompt).slice(0, 200)}`
    )
    assert.equal(
      foreignPrompt?.error?.code,
      -32602,
      `another endpoint's prompt must be refused: ${JSON.stringify(foreignPrompt).slice(0, 200)}`
    )
  })
})
