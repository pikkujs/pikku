import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { addFunction } from '@pikku/core/function'

import { PikkuMCPServer } from './index.js'

/**
 * Every MCP method pikku registers, driven through the HTTP entry.
 *
 * `tools/call` was the only method any test had ever sent, so the other five
 * registrations — both resource listings, `resources/read`, and the two prompt
 * methods — were held only by the string literals in `setupResources` and
 * `setupPrompts`. A method name that drifted in the v2 SDK would have answered
 * `Method not found` to every client while the suite stayed green, which is
 * exactly the kind of break a registration test exists to catch.
 */
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const RESOURCE_URI = 'notes://all'
const TEMPLATE_URI = 'notes://{noteId}'
const PROMPT_NAME = 'summarise'

const rpc = async (
  handler: (request: Request) => Promise<Response>,
  method: string,
  params: Record<string, unknown> = {}
) => {
  const response = await handler(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
  )
  const body = await response.text()
  const frame = body.split('\n').find((line) => line.startsWith('data:'))
  return JSON.parse((frame ?? body).replace(/^data:\s*/, ''))
}

const declareFunc = (id: string, result: unknown) => {
  addFunction(id, { func: async () => result } as never, null)
  pikkuState(null, 'function', 'meta')[id] = {
    name: id,
    sessionless: true,
    permissions: [],
  } as never
}

const startServer = async () => {
  // A concrete resource and a templated one: `resources/list` reports the
  // first, `resources/templates/list` the second, and the split is by whether
  // the resource declares an input schema.
  pikkuState(null, 'mcp', 'resourcesMeta')[RESOURCE_URI] = {
    uri: RESOURCE_URI,
    title: 'All notes',
    description: 'Every note',
    mimeType: 'text/plain',
    pikkuFuncId: 'allNotesFunc',
    inputSchema: null,
  } as never
  pikkuState(null, 'mcp', 'resources').set(RESOURCE_URI, {
    uri: RESOURCE_URI,
  } as never)
  declareFunc('allNotesFunc', [
    { uri: RESOURCE_URI, mimeType: 'text/plain', text: 'note one' },
  ])

  pikkuState(null, 'mcp', 'promptsMeta')[PROMPT_NAME] = {
    name: PROMPT_NAME,
    description: 'Summarise a note',
    arguments: [{ name: 'noteId', description: 'Which note', required: true }],
    pikkuFuncId: 'summariseFunc',
  } as never
  pikkuState(null, 'mcp', 'prompts').set(PROMPT_NAME, {
    name: PROMPT_NAME,
  } as never)
  declareFunc('summariseFunc', [
    { role: 'user', content: { type: 'text', text: 'Summarise note one' } },
  ])

  const server = new PikkuMCPServer(
    {
      name: 'test',
      version: '1.0.0',
      mcpJSON: {
        tools: [],
        resources: [
          {
            name: TEMPLATE_URI,
            uri: TEMPLATE_URI,
            description: 'One note',
            parameters: { type: 'object' },
          },
        ],
        prompts: [],
      },
      capabilities: { resources: {}, prompts: {} },
    } as never,
    logger as never
  )
  await server.init()
  return server.createFetchHandler({ path: '/mcp' })
}

describe('every registered MCP method answers over the fetch handler', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
  })

  test('resources/list reports the concrete resources', async () => {
    const { handler } = await startServer()
    const message = await rpc(handler, 'resources/list')
    assert.deepEqual(message.result?.resources, [
      {
        name: 'All notes',
        uri: RESOURCE_URI,
        title: 'All notes',
        description: 'Every note',
        mimeType: 'text/plain',
      },
    ])
  })

  test('resources/templates/list reports the templated ones', async () => {
    const { handler } = await startServer()
    const message = await rpc(handler, 'resources/templates/list')
    assert.equal(message.result?.resourceTemplates?.length, 1)
    assert.equal(
      message.result.resourceTemplates[0].uriTemplate,
      TEMPLATE_URI,
      'a resource declaring parameters is a template, not a listing entry'
    )
  })

  test('resources/read runs the resource function', async () => {
    const { handler } = await startServer()
    const message = await rpc(handler, 'resources/read', { uri: RESOURCE_URI })
    assert.deepEqual(message.result?.contents, [
      { uri: RESOURCE_URI, mimeType: 'text/plain', text: 'note one' },
    ])
  })

  test('prompts/list reports the prompt and its arguments', async () => {
    const { handler } = await startServer()
    const message = await rpc(handler, 'prompts/list')
    assert.deepEqual(message.result?.prompts, [
      {
        name: PROMPT_NAME,
        description: 'Summarise a note',
        arguments: [
          { name: 'noteId', description: 'Which note', required: true },
        ],
      },
    ])
  })

  test('prompts/get runs the prompt function', async () => {
    const { handler } = await startServer()
    const message = await rpc(handler, 'prompts/get', {
      name: PROMPT_NAME,
      arguments: { noteId: 'one' },
    })
    assert.deepEqual(message.result?.messages, [
      { role: 'user', content: { type: 'text', text: 'Summarise note one' } },
    ])
  })
})
