/**
 * Verifies the MCP OAuth challenge against real generated code.
 *
 * The unit tests hand-write the function meta they read, which is exactly the
 * assumption worth checking here: that `pikku prebuild` actually carries
 * `sessionless` and `auth` into the generated meta and names all three tools in
 * `mcp.json`, and that the server built from those files challenges the two
 * gated tools while leaving the open one alone.
 */

import { readFile } from 'node:fs/promises'
import { createConfig, createSingletonServices } from '../src/services.js'
import '../.pikku/pikku-bootstrap.gen.js'

import { addGlobalMiddleware } from '@pikku/core/middleware'
import { mcpTargetRequiresSession } from '@pikku/core/mcp'
import { PikkuMCPServer } from '@pikku/modelcontextprotocol'

const BASE = 'http://localhost'
const MCP_PATH = '/mcp'
const TOKEN = 'Bearer verifier-token'

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message })
    console.log(`  ✗ ${name}: ${e.message}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
  }
}

function assertTruthy(value: unknown, label: string): void {
  if (!value) {
    throw new Error(`${label}: expected a truthy value, got ${String(value)}`)
  }
}

type Handler = (request: Request) => Promise<Response>

const rpc = (
  handler: Handler,
  body: unknown,
  headers: Record<string, string> = {}
) =>
  handler(
    new Request(`${BASE}${MCP_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(body),
    })
  )

const callTool = async (
  handler: Handler,
  name: string,
  headers: Record<string, string> = {}
) => {
  const response = await rpc(
    handler,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: {} },
    },
    headers
  )
  const text = await response.text()
  const frame = text.split('\n').find((line) => line.startsWith('data:'))
  let message: any
  try {
    message = JSON.parse((frame ?? text).replace(/^data:\s*/, ''))
  } catch {
    message = text
  }
  return { status: response.status, headers: response.headers, text, message }
}

async function main(): Promise<void> {
  const config = await createConfig()
  await createSingletonServices(config)

  // The app's own session resolution, as every pikku app supplies it: a global
  // middleware reading the request and setting a session. The transport never
  // verifies a token itself, so this is the only thing that can.
  addGlobalMiddleware([
    async (_services: any, wire: any, next: any) => {
      if (wire.http?.request?.header('authorization') === TOKEN) {
        wire.setSession?.({ userId: 'usr_verifier' })
      }
      await next()
    },
  ] as never)

  const mcpJson = JSON.parse(
    await readFile(new URL('../.pikku/mcp.json', import.meta.url), 'utf-8')
  )

  console.log('\nMCP Auth Verifier')
  console.log('=================')

  console.log('\n--- Generated surface ---')

  await runTest('prebuild names all three tools in mcp.json', async () => {
    const names = (mcpJson.tools ?? []).map((t: any) => t.name).sort()
    assertEqual(
      names,
      ['myOrders', 'placeOrder', 'searchCatalog'],
      'tool names'
    )
  })

  await runTest(
    'the generated meta says which tools need a session',
    async () => {
      assertEqual(
        mcpTargetRequiresSession('tool', 'searchCatalog'),
        false,
        'a sessionless tool is open'
      )
      assertEqual(
        mcpTargetRequiresSession('tool', 'myOrders'),
        true,
        'a sessionless tool declaring auth: true is gated'
      )
      assertEqual(
        mcpTargetRequiresSession('tool', 'placeOrder'),
        true,
        'a pikkuFunc tool is gated'
      )
    }
  )

  const server = new PikkuMCPServer(
    {
      name: 'mcp-auth-verifier',
      version: '1.0.0',
      mcpJSON: mcpJson,
      capabilities: { tools: {} },
    } as never,
    (await createSingletonServices(config)).logger as never
  )
  await server.init()
  const { handler } = server.createFetchHandler({ path: MCP_PATH })

  console.log('\n--- Refusals carry a challenge ---')

  for (const tool of ['myOrders', 'placeOrder']) {
    await runTest(`${tool} answers 401 to an anonymous caller`, async () => {
      const res = await callTool(handler, tool)
      assertEqual(res.status, 401, `${tool} status`)
      const challenge = res.headers.get('WWW-Authenticate') ?? ''
      assertTruthy(challenge.startsWith('Bearer'), 'a bearer challenge')
      assertTruthy(
        challenge.includes(
          'resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp"'
        ),
        `challenge names the metadata document, got: ${challenge}`
      )
    })
  }

  console.log('\n--- Open tools are untouched ---')

  await runTest(
    'searchCatalog runs for an anonymous caller on the same endpoint',
    async () => {
      const res = await callTool(handler, 'searchCatalog')
      assertEqual(res.status, 200, 'searchCatalog status')
      assertEqual(res.headers.get('WWW-Authenticate'), null, 'no challenge')
      assertEqual(
        res.message?.result?.content,
        [{ type: 'text', text: '"catalog"' }],
        'searchCatalog result'
      )
    }
  )

  await runTest(
    'tools/list is not gated, so a client can discover',
    async () => {
      const response = await rpc(handler, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      })
      assertEqual(response.status, 200, 'tools/list status')
    }
  )

  console.log('\n--- A credentialed caller gets through ---')

  await runTest('myOrders runs once the request carries a token', async () => {
    const res = await callTool(handler, 'myOrders', { Authorization: TOKEN })
    assertEqual(res.status, 200, 'myOrders status')
    assertEqual(
      res.message?.result?.content,
      [{ type: 'text', text: '"orders"' }],
      'myOrders result'
    )
  })

  console.log('\n--- Discovery ---')

  await runTest(
    'the protected resource metadata is served next to the endpoint',
    async () => {
      const response = await handler(
        new Request(`${BASE}/.well-known/oauth-protected-resource/mcp`)
      )
      assertEqual(response.status, 200, 'metadata status')
      assertEqual(
        await response.json(),
        {
          resource: 'http://localhost/mcp',
          authorization_servers: ['http://localhost/'],
          bearer_methods_supported: ['header'],
        },
        'default metadata document'
      )
    }
  )

  await runTest('an app can name its own authorization server', async () => {
    const { handler: configured } = server.createFetchHandler({
      path: MCP_PATH,
      auth: {
        authorizationServers: ['https://auth.example.com'],
        scopesSupported: ['mcp'],
        resourceName: 'Verifier',
      },
    })
    const response = await configured(
      new Request(`${BASE}/.well-known/oauth-protected-resource/mcp`)
    )
    assertEqual(
      await response.json(),
      {
        resource: 'http://localhost/mcp',
        authorization_servers: ['https://auth.example.com'],
        bearer_methods_supported: ['header'],
        scopes_supported: ['mcp'],
        resource_name: 'Verifier',
      },
      'configured metadata document'
    )
  })

  await server.stop()

  const failed = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length > 0) {
    for (const f of failed) {
      console.error(`  ✗ ${f.name}: ${f.error}`)
    }
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
