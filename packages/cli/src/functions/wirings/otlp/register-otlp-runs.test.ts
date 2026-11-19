import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { mock } from 'bun:test'
import { fetchData, httpRouter, wireHTTP } from '@pikku/core/http'
import { addGlobalMiddleware, pikkuMiddleware } from '@pikku/core/middleware'
import { createOtlpSinks, type OtlpSinkBase } from '@pikku/core/otlp'
import { OTLP_RUNS_TOPIC, type RunSnapshot } from '@pikku/core/otlp/runs'
import * as coreScope from '@pikku/core/scope'
import { pikkuState, resetPikkuState } from '@pikku/core/state'
import {
  createEventHubDistributor,
  createLocalDeliveryBackend,
  setEventHubDistributor,
} from '@pikku/core/internal/event-hub'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as holder from './register-otlp-runs.js'
import { serializeOtlpRunsScaffold } from './serialize-otlp-runs-scaffold.js'

const { getOtlpRuns, registerOtlpRuns } = holder
const OTLP_RUNS_SNAPSHOT_ROUTE = '/otlp/runs/snapshot'
const OTLP_RUNS_STREAM_ROUTE = '/otlp/runs/stream'

// `#pikku/*` resolves into dist, which a unit run has not built: the generated
// leaves it points at are in .pikku next to the source.
const functionLeaf = await import('../../../../.pikku/function/index.js')
const middlewareLeaf = await import('../../../../.pikku/middleware/index.js')
void mock.module('#pikku/function', () => functionLeaf)
void mock.module('#pikku/middleware', () => middlewareLeaf)
const httpLeaf = await import('../../../../.pikku/http/index.js')
void mock.module('#pikku/http', () => httpLeaf)
void mock.module('#pikku/scopes', () => coreScope)
void mock.module('@pikku/cli/otlp-runs', () => holder)
const { wireHTTPRoutes } = httpLeaf

// The routes under test are the scaffold's own output, written beside the
// package and loaded the way a project loads it.
const generatedDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.tmp/otlp-runs-test'
)
mkdirSync(generatedDir, { recursive: true })
const generatedFile = join(generatedDir, 'otlp-runs.gen.ts')
writeFileSync(
  generatedFile,
  serializeOtlpRunsScaffold((name) => `#pikku/${name}`)
)
const { otlpRunsRoutes } = await import(generatedFile)

class Request {
  private params: Record<string, string | string[] | undefined> = {}
  constructor(private path_: string) {}
  method() {
    return 'get' as const
  }
  path() {
    return this.path_
  }
  header() {
    return null
  }
  cookie() {
    return null
  }
  headers() {
    return {}
  }
  setParams(params: Record<string, string | string[] | undefined>) {
    this.params = params
  }
  async data() {
    return {}
  }
}

class Response {
  status_ = 200
  body: unknown
  frames: string[] = []
  mode: string | null = null
  status(code: number) {
    this.status_ = code
    return this
  }
  header() {
    return this
  }
  json(data: unknown) {
    this.body = data
    return this
  }
  arrayBuffer(data: string) {
    this.frames.push(data)
    return this
  }
  setMode(mode: string) {
    this.mode = mode
  }
  flushHeaders() {}
  onClose() {}
  heartbeat() {}
  close() {}
}

const logger = { info() {}, warn() {}, error() {}, debug() {} }

let session: { userId: string; scopes: string[] } | undefined

const call = async (route: string) => {
  const response = new Response()
  await fetchData(new Request(route) as any, response as any)
  return response
}

const finishRun = (sink: OtlpSinkBase, id: string, now: number) => {
  const startTimeUnixNano = BigInt(now) * 1_000_000n
  const span = {
    traceId: id.padEnd(32, '0'),
    spanId: id,
    name: id,
    kind: 'server' as const,
    startTimeUnixNano,
    endTimeUnixNano: startTimeUnixNano + 5_000_000n,
    status: { code: 'ok' as const },
    attributes: { 'pikku.function.id': id },
  }
  sink.onSpanStart?.(span as any)
  sink.exportSpans([span as any])
}

describe('registerOtlpRuns', () => {
  let distributor: ReturnType<typeof createEventHubDistributor>
  let otlpSinks: ReturnType<typeof createOtlpSinks>

  const register = () =>
    registerOtlpRuns({
      otlpSinks,
      eventHub: distributor.publisher(),
      serviceName: 'app',
    })

  const wireRoutes = () => {
    const funcMeta = pikkuState(null, 'function', 'meta') as any
    const common = {
      inputSchemaName: null,
      outputSchemaName: null,
      scopes: ['pikku:otlp:runs'],
      tags: ['pikku'],
    }
    funcMeta.pikkuOtlpRunsSnapshot = {
      ...common,
      pikkuFuncId: 'pikkuOtlpRunsSnapshot',
    }
    funcMeta.pikkuOtlpRunsSubscribe = {
      ...common,
      pikkuFuncId: 'pikkuOtlpRunsSubscribe',
      subscribe: { topicPattern: OTLP_RUNS_TOPIC },
    }
    const httpMeta = pikkuState(null, 'http', 'meta') as any
    for (const [route, pikkuFuncId, sse] of [
      [OTLP_RUNS_SNAPSHOT_ROUTE, 'pikkuOtlpRunsSnapshot', false],
      [OTLP_RUNS_STREAM_ROUTE, 'pikkuOtlpRunsSubscribe', true],
    ] as const) {
      httpMeta.get[route] = {
        pikkuFuncId,
        route,
        method: 'get',
        auth: true,
        requiresSession: true,
        tags: ['pikku'],
        ...(sse ? { sse } : {}),
      }
    }
    wireHTTPRoutes({ routes: { otlpRuns: otlpRunsRoutes } })
    httpRouter.reset()
  }

  beforeEach(() => {
    getOtlpRuns()?.close()
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)
    distributor = createEventHubDistributor({})
    distributor.registerDelivery(createLocalDeliveryBackend())
    setEventHubDistributor(distributor)
    otlpSinks = createOtlpSinks()
    session = undefined
    httpRouter.reset()
    wireRoutes()
    addGlobalMiddleware([
      pikkuMiddleware(async (_services, { setInitialSession }, next) => {
        if (session) setInitialSession?.(session as any)
        return next()
      }),
    ])
  })

  test('without a session both routes are 401 and the stream never opens', async () => {
    register()
    assert.equal((await call(OTLP_RUNS_SNAPSHOT_ROUTE)).status_, 401)
    const stream = await call(OTLP_RUNS_STREAM_ROUTE)
    assert.equal(stream.status_, 401)
    assert.equal(stream.mode, null)
    assert.equal(distributor.subscriptionCount(), 0)
  })

  test('a session without pikku:otlp:runs is 403 on both routes', async () => {
    register()
    session = {
      userId: 'u',
      scopes: ['admin', 'otlp:runs', 'otlp', 'otlp:*', 'pikku:other'],
    }
    assert.equal((await call(OTLP_RUNS_SNAPSHOT_ROUTE)).status_, 403)
    const stream = await call(OTLP_RUNS_STREAM_ROUTE)
    assert.equal(stream.status_, 403)
    assert.equal(distributor.subscriptionCount(), 0)
  })

  test('pikku:otlp:runs, or a grant above it, reads the snapshot and opens the stream', async () => {
    register()
    for (const scopes of [
      ['pikku:otlp:runs'],
      ['pikku:otlp:*'],
      ['pikku'],
      ['*'],
    ]) {
      session = { userId: 'u', scopes }
      assert.equal((await call(OTLP_RUNS_SNAPSHOT_ROUTE)).status_, 200)
    }
    session = { userId: 'u', scopes: ['pikku:otlp:runs'] }
    const stream = await call(OTLP_RUNS_STREAM_ROUTE)
    assert.equal(stream.status_, 200)
    assert.equal(stream.mode, 'stream')
    assert.equal(distributor.subscriptionCount(), 1)
    assert.equal(distributor.subscriptions()[0].topic, OTLP_RUNS_TOPIC)
  })

  const wireOtherSubscribe = (pattern: string, onRun: () => void) => {
    const meta = pikkuState(null, 'function', 'meta') as any
    meta.otherSubscribe = {
      pikkuFuncId: 'otherSubscribe',
      inputSchemaName: null,
      outputSchemaName: null,
      subscribe: { topicPattern: pattern },
    }
    const httpMeta = pikkuState(null, 'http', 'meta') as any
    httpMeta.get['/other/stream'] = {
      pikkuFuncId: 'otherSubscribe',
      route: '/other/stream',
      method: 'get',
      sse: true,
    }
    wireHTTP({
      route: '/other/stream',
      method: 'get',
      sse: true,
      func: {
        func: async () => {
          onRun()
          return OTLP_RUNS_TOPIC
        },
      },
    } as any)
    httpRouter.reset()
  }

  test('another subscribe function cannot read the live runs topic outside its pattern', async () => {
    register()
    let ran = 0
    wireOtherSubscribe('order:${string}', () => ran++)
    session = { userId: 'u', scopes: [] }
    const response = await call('/other/stream')
    assert.equal(ran, 1)
    assert.notEqual(response.mode, 'stream')
    assert.equal(distributor.subscriptionCount(), 0)
  })

  test('a subscribe function whose pattern covers the runs topic still needs pikku:otlp:runs', async () => {
    register()
    let ran = 0
    wireOtherSubscribe('${string}', () => ran++)
    session = { userId: 'u', scopes: [] }
    const refused = await call('/other/stream')
    assert.equal(ran, 1)
    assert.notEqual(refused.mode, 'stream')
    assert.equal(distributor.subscriptionCount(), 0)

    session = { userId: 'u', scopes: ['pikku:otlp:runs'] }
    const allowed = await call('/other/stream')
    assert.equal(allowed.mode, 'stream')
    assert.equal(distributor.subscriptionCount(), 1)
  })

  test('the snapshot lists the run and its seq matches what the stream carries', async () => {
    const live = register()
    session = { userId: 'u', scopes: ['pikku:otlp:runs'] }
    const stream = await call(OTLP_RUNS_STREAM_ROUTE)

    finishRun(otlpSinks.list()[0], 'a', Date.now())
    const snapshot = (await call(OTLP_RUNS_SNAPSHOT_ROUTE)).body as RunSnapshot
    assert.ok(snapshot.seq > 0)
    assert.ok(snapshot.recent.some((run) => run.rootSpanId === 'a'))

    const seqs = (): number[] =>
      stream.frames
        .flatMap((frame) => {
          try {
            const batch = JSON.parse(frame)
            return Array.isArray(batch?.events) ? batch.events : []
          } catch {
            return []
          }
        })
        .map((event: any) => event.seq)
    const deadline = Date.now() + 5000
    while (!seqs().includes(snapshot.seq) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.ok(seqs().includes(snapshot.seq))
    live.close()
  })

  test('registering again, as a dev reload does, adds no second sink and keeps serving', async () => {
    register()
    register()
    assert.equal(otlpSinks.list().length, 1)
    session = { userId: 'u', scopes: ['pikku:otlp:runs'] }
    assert.equal((await call(OTLP_RUNS_SNAPSHOT_ROUTE)).status_, 200)
    assert.equal(otlpSinks.list().length, 1)
  })

  describe('the live gate', () => {
    test('both routes are 404 while no feed is registered, whatever the caller holds', async () => {
      assert.equal(getOtlpRuns(), undefined)
      for (const current of [
        undefined,
        { userId: 'u', scopes: ['pikku:otlp:runs'] },
        { userId: 'u', scopes: ['*'] },
      ]) {
        session = current
        assert.equal((await call(OTLP_RUNS_SNAPSHOT_ROUTE)).status_, 404)
        const stream = await call(OTLP_RUNS_STREAM_ROUTE)
        assert.equal(stream.status_, 404)
        assert.equal(stream.mode, null)
      }
      assert.equal(distributor.subscriptionCount(), 0)
    })

    test('the routes pass once a feed is registered and are 404 again after it closes', async () => {
      session = { userId: 'u', scopes: ['pikku:otlp:runs'] }
      assert.equal((await call(OTLP_RUNS_SNAPSHOT_ROUTE)).status_, 404)
      const live = register()
      assert.equal((await call(OTLP_RUNS_SNAPSHOT_ROUTE)).status_, 200)
      assert.equal((await call(OTLP_RUNS_STREAM_ROUTE)).mode, 'stream')
      live.close()
      assert.equal((await call(OTLP_RUNS_SNAPSHOT_ROUTE)).status_, 404)
    })
  })
})
