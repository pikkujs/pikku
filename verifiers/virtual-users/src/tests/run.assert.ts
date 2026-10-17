import assert from 'node:assert/strict'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, test } from 'node:test'

import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { pikkuVirtualUser } from '@pikku/better-auth'
import { LocalVariablesService } from '@pikku/core/services'
import { runQueueJob } from '@pikku/core/queue'
import { runScheduledTask } from '@pikku/core/scheduler'

import { boot, HOUR } from './boot.js'

const GATE = 'PIKKU_DEV_VIRTUAL_USER_SIGN_IN'

/**
 * The app a run signs in to: better-auth with the virtual user plugin behind a
 * real HTTP server, and one endpoint that answers only a valid session. The run
 * reaches it the way a deployed one does, by URL, carrying the cookie it got.
 */
const startApp = async (gateOpen: boolean) => {
  if (gateOpen) process.env[GATE] = 'true'
  else delete process.env[GATE]
  const hits: { email: string }[] = []
  let auth: any
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const body = await new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
    })
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${req.url}`
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers.set(k, v)
    }
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    let response: Response
    if (req.url!.startsWith('/auth/')) {
      response = await auth.handler(
        new Request(url, {
          method: req.method,
          headers,
          body: hasBody ? body : undefined,
        })
      )
    } else if (req.url === '/rpc/whoAmI') {
      const session = await auth.api.getSession({ headers })
      if (!session) {
        response = Response.json({ error: 'unauthorized' }, { status: 401 })
      } else {
        hits.push({ email: session.user.email })
        response = Response.json({
          email: session.user.email,
          virtualUser: (session.user as any).virtualUser === true,
        })
      }
    } else {
      response = new Response('not found', { status: 404 })
    }
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') res.setHeader(key, value)
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length) res.setHeader('set-cookie', cookies)
    res.end(Buffer.from(await response.arrayBuffer()))
  }
  const server: Server = createServer((req, res) => {
    void handle(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  auth = betterAuth({
    baseURL: apiUrl,
    basePath: '/auth',
    secret: 'verifier-secret-verifier-secret-123',
    database: memoryAdapter({ user: [], session: [], account: [] }),
    emailAndPassword: { enabled: true },
    plugins: [pikkuVirtualUser({ logger: { info() {}, warn() {} } })],
  })
  return {
    auth,
    apiUrl,
    hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/** The virtual user's turns, scripted: read the endpoint, call it, finish. */
const scriptedRunner = () => {
  const actions = [
    { kind: 'describe', rpcName: 'whoAmI' },
    { kind: 'call', rpcName: 'whoAmI', args: {} },
    { kind: 'complete', summary: 'done' },
  ]
  let turn = 0
  return {
    run: async () => ({
      text: '',
      object: actions[turn++] ?? actions[2],
      toolCalls: [],
      toolResults: [],
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: 'stop',
    }),
  }
}

const dueNow = {
  virtualUserId: 'guest',
  enabled: true,
  // The default disposition abandons an intent on a random move, which ends the
  // scripted run before its call; this one never does.
  disposition: 'accountable' as const,
  goals: ['find out who the app thinks I am'],
  minIntervalMs: HOUR,
  maxIntervalMs: 3 * HOUR,
  nextRunAt: new Date(Date.now() - 1000),
}

describe('a scheduled virtual user run signs in and uses the app', () => {
  let app: Awaited<ReturnType<typeof startApp>>

  afterEach(async () => {
    delete process.env[GATE]
    await app.close()
  })

  const startRun = async (nodeEnv: string) => {
    const world = await boot(nodeEnv, {
      auth: async () => app.auth,
      agentRunner: scriptedRunner(),
      variables: new LocalVariablesService({
        VIRTUAL_USER_API_URL: app.apiUrl,
        VIRTUAL_USER_MODEL: 'scripted',
      }),
    })
    await world.virtualUserScheduleStore.set({ ...dueNow })
    await runScheduledTask({ name: 'virtualUsers' })
    return world
  }

  const runQueued = async (world: Awaited<ReturnType<typeof boot>>) => {
    assert.equal(world.queued.length, 1, 'the tick queued the run')
    await runQueueJob({
      job: {
        id: 'job-1',
        queueName: world.queued[0]!.queue,
        data: world.queued[0]!.job,
        status: () => 'active',
      } as any,
    })
  }

  test('the tick starts the run, which signs in in-process and gets data over HTTP', async () => {
    app = await startApp(true)
    const world = await startRun('staging')

    await runQueued(world)

    const [run] = await world.virtualUserRunStore.list({
      virtualUserId: 'guest',
    })
    assert.equal(
      run!.status,
      'completed',
      run!.error ?? 'the run did not complete'
    )
    const steps = await world.virtualUserRunStore.steps(run!.runId)
    const call = steps.find((s) => s.action.kind === 'call')!
    assert.equal(call.status, 200, 'the authenticated call succeeded')
    assert.match(call.response ?? '', /"virtualUser":true/)
    assert.equal(app.hits.length, 1, 'the app saw one authenticated request')
    assert.match(app.hits[0]!.email, /^guest@/)
  })

  test('the endpoint refuses a caller with no session', async () => {
    app = await startApp(true)
    const res = await fetch(`${app.apiUrl}/rpc/whoAmI`, { method: 'POST' })
    assert.equal(res.status, 401)
  })

  test('the in-process route is not reachable over HTTP', async () => {
    app = await startApp(true)
    const res = await fetch(
      `${app.apiUrl}/auth/sign-in/virtual-user-internal`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'guest@virtualuser.invalid' }),
      }
    )
    assert.equal(res.status, 404)
  })

  test('with the sign-in gate shut, the run cannot sign in and nothing authenticated happens', async () => {
    app = await startApp(false)
    const world = await startRun('production')
    assert.equal(world.queued.length, 0, 'production never even queues the run')

    app.hits.length = 0
    const open = await boot('staging', {
      auth: async () => app.auth,
      agentRunner: scriptedRunner(),
      variables: new LocalVariablesService({
        VIRTUAL_USER_API_URL: app.apiUrl,
        VIRTUAL_USER_MODEL: 'scripted',
      }),
    })
    await open.virtualUserScheduleStore.set({ ...dueNow })
    await runScheduledTask({ name: 'virtualUsers' })
    await runQueued(open)

    const [run] = await open.virtualUserRunStore.list({
      virtualUserId: 'guest',
    })
    assert.match(run!.findings[0]!.detail, /cannot sign in/)
    assert.equal(app.hits.length, 0)
  })
})
