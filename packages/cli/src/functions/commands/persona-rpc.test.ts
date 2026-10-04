import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, test, before, after, beforeEach } from 'node:test'
import { personaRpc } from './persona-rpc.js'

const PERSONAS = [
  {
    id: 'susan',
    name: 'Susan',
    roles: ['viewer'],
    goals: [],
    tags: [],
    runnable: true,
  },
]

let server: Server
let apiUrl: string
let signInStatus = 200
let rpcReply: { status: number; body: unknown } = { status: 200, body: {} }
let output = ''

const run = (data: Record<string, unknown>, url = apiUrl) =>
  personaRpc.func(
    {
      config: { environments: { local: { apiUrl: url } } },
      getInspectorState: async () => ({
        personas: { definitions: PERSONAS },
        rpc: {
          exposedMeta: { getTodo: 'getTodo', deleteTodo: 'deleteTodo' },
          internalMeta: { hiddenThing: 'hiddenThing' },
        },
      }),
      variables: {
        get: async (name: string) =>
          name === 'SCENARIO_ACTOR_SECRET' ? 'x'.repeat(48) : undefined,
      },
    } as any,
    data as any,
    {} as any
  )

const write = process.stdout.write.bind(process.stdout)

before(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith('/auth/')) {
      res.writeHead(
        signInStatus,
        signInStatus === 200 ? { 'set-cookie': 'session=1' } : {}
      )
      res.end(signInStatus === 200 ? '{}' : '{"message":"bad secret"}')
      return
    }
    res.writeHead(rpcReply.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(rpcReply.body))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => server.close())

beforeEach(() => {
  signInStatus = 200
  rpcReply = { status: 200, body: {} }
  output = ''
  process.exitCode = 0
  process.stdout.write = ((chunk: string) => ((output += chunk), true)) as any
})

const restore = () => {
  process.stdout.write = write
  const code = process.exitCode
  process.exitCode = 0
  return code
}

describe('pikku persona rpc', () => {
  test('prints the status and the body of a call that worked', async () => {
    rpcReply = { status: 200, body: { id: '1', title: 'Milk' } }
    await run({ rpc: 'getTodo', as: 'susan', data: '{"id":"1"}' })
    assert.equal(restore(), 0)
    assert.match(output, /^200\n/)
    assert.match(output, /"title": "Milk"/)
  })

  test('refuses a name that is not exposed, and says so for an internal one', async () => {
    await assert.rejects(
      run({ rpc: 'getTod', as: 'susan' }),
      /No exposed RPC 'getTod'.*getTodo/
    )
    await assert.rejects(
      run({ rpc: 'hiddenThing', as: 'susan' }),
      /declared but not exposed/
    )
    restore()
  })

  test('refuses an unknown persona', async () => {
    await assert.rejects(
      run({ rpc: 'getTodo', as: 'bob' }),
      /No persona 'bob'.*susan/
    )
    restore()
  })

  test('blames the dev server when it does not know a declared RPC', async () => {
    rpcReply = {
      status: 500,
      body: { message: 'RPC function not found: getTodo' },
    }
    await assert.rejects(
      run({ rpc: 'getTodo', as: 'susan' }),
      /dev server is stale/
    )
    restore()
  })

  test('a failed sign-in says nothing about the function', async () => {
    signInStatus = 401
    await assert.rejects(
      run({ rpc: 'getTodo', as: 'susan' }),
      /Could not sign in as 'susan'.*says nothing about 'getTodo'/
    )
    restore()
  })

  test('a 403 names the persona and its roles as not permitted', async () => {
    rpcReply = { status: 403, body: { message: 'Forbidden' } }
    await run({ rpc: 'deleteTodo', as: 'susan' })
    assert.equal(restore(), 1)
    assert.match(
      output,
      /'susan' \(viewer\) is not permitted to call 'deleteTodo': 403/
    )
  })

  test('says when nothing is listening', async () => {
    await assert.rejects(
      run({ rpc: 'getTodo', as: 'susan' }, 'http://127.0.0.1:1'),
      /Nothing answered at http:\/\/127\.0\.0\.1:1/
    )
    restore()
  })

  test('refuses --data that is not JSON', async () => {
    await assert.rejects(
      run({ rpc: 'getTodo', as: 'susan', data: '{id:1}' }),
      /--data is not JSON/
    )
    restore()
  })
})
