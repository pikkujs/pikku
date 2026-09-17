import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { addFunction } from '@pikku/core/function'

import { PikkuMCPServer } from './index.js'

/**
 * The claims half of "MCP carries the caller".
 *
 * `createFetchHandler` takes an `authInfo` and hands it to the SDK, which is
 * where it would stop: the SDK only offers it back on the factory context, so a
 * tool sees nothing unless the factory carries it onto the wire. What a header
 * cannot prove — which scopes a token was issued for, which client holds it —
 * only exists here, so a tool that reads `wire.http.authInfo` is reading the
 * one thing it could not have derived for itself.
 */
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const callTool = async (
  handler: (
    request: Request,
    requestOptions?: { authInfo?: any }
  ) => Promise<Response>,
  name: string,
  requestOptions?: { authInfo?: any }
) => {
  const response = await handler(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer tok',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: {} },
      }),
    }),
    requestOptions
  )
  const body = await response.text()
  const frame = body.split('\n').find((line) => line.startsWith('data:'))
  return JSON.parse((frame ?? body).replace(/^data:\s*/, ''))
}

const buildServer = async () => {
  pikkuState(null, 'mcp', 'toolsMeta').claims = {
    name: 'claims',
    title: 'Claims',
    description: 'Reports the verified claims it was handed',
    pikkuFuncId: 'claimsFunc',
    inputSchema: null,
    outputSchema: 'MCPToolResponse',
  } as never
  addFunction(
    'claimsFunc',
    {
      func: async (_services: any, _data: any, wire: any) => [
        { type: 'text', text: JSON.stringify(wire.http?.authInfo ?? null) },
      ],
    } as never,
    null
  )
  pikkuState(null, 'function', 'meta').claimsFunc = {
    name: 'claimsFunc',
    sessionless: true,
    permissions: [],
  } as never

  const server = new PikkuMCPServer(
    {
      name: 'test',
      version: '1.0.0',
      mcpJSON: { tools: [{ name: 'claims' }], resources: [], prompts: [] },
      capabilities: { tools: {} },
    } as never,
    logger as never
  )
  await server.init()
  return server.createFetchHandler({ path: '/mcp' })
}

describe('createFetchHandler carries verified claims through to the tool', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
  })

  test('a tool reads the authInfo the host passed in', async () => {
    const { handler } = await buildServer()
    const authInfo = {
      token: 'tok',
      clientId: 'client-42',
      scopes: ['todos:read', 'todos:write'],
      expiresAt: 4102444800,
    }

    const message = await callTool(handler, 'claims', { authInfo })

    assert.deepEqual(
      JSON.parse(message.result?.content?.[0]?.text),
      authInfo,
      'the claims the host verified must reach the tool unchanged'
    )
  })

  // A token's scopes are not in its header, so a tool that guards on them would
  // silently guard on nothing if the field were dropped between the handler and
  // the wire.
  test('a host that verified nothing leaves authInfo unset', async () => {
    const { handler } = await buildServer()

    const message = await callTool(handler, 'claims')

    assert.equal(
      message.result?.content?.[0]?.text,
      'null',
      'authInfo must be absent rather than invented from the request headers'
    )
  })
})
