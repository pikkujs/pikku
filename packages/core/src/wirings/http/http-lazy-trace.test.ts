import { test, describe, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { fetch, wireHTTP } from './http-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import { httpRouter } from './routers/http-router.js'
import { RecordingTracer } from '../../testing/recording-tracer.js'
import { formatTraceparent } from '../../trace.js'

const HEX_32 = /^[0-9a-f]{32}$/
const HEX_16 = /^[0-9a-f]{16}$/

let idDraws = 0
const realGetRandomValues = globalThis.crypto.getRandomValues.bind(
  globalThis.crypto
)

const wire = (
  route: string,
  func: (services: any, data: any, wire: any) => Promise<unknown>,
  method = 'get'
) => {
  const id = `fn${route.replace(/\W/g, '_')}`
  pikkuState(null, 'function', 'meta')[id] = {
    pikkuFuncId: id,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  } as any
  pikkuState(null, 'http', 'meta')[method][route] = {
    pikkuFuncId: id,
    route,
    method,
  } as any
  addFunction(id, { func })
  wireHTTP({
    route,
    method: method as 'get',
    auth: false,
    func: { func } as any,
  })
  httpRouter.initialize()
}

const get = (route: string, init?: RequestInit, params?: object) =>
  fetch(new Request(`http://localhost${route}`, init), params)

const services = (extra: Record<string, unknown> = {}) => {
  const logs: { level: string; message: unknown; scope?: string }[] = []
  const make = (scope?: string): any => ({
    info: (message: unknown) => logs.push({ level: 'info', message, scope }),
    warn: (message: unknown) => logs.push({ level: 'warn', message, scope }),
    error: (message: unknown) => logs.push({ level: 'error', message, scope }),
    debug() {},
    setLevel() {},
    scope: (traceId: string) => make(traceId),
  })
  pikkuState(null, 'package', 'singletonServices', {
    logger: make(),
    ...extra,
  } as any)
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  } as any)
  return logs
}

describe('an HTTP trace id is generated only where it is read', () => {
  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()
    idDraws = 0
    ;(globalThis.crypto as any).getRandomValues = (array: Uint8Array) => {
      if (array.byteLength === 16) idDraws++
      return realGetRandomValues(array)
    }
  })
  afterEach(() => {
    ;(globalThis.crypto as any).getRandomValues = realGetRandomValues
  })

  test('a successful request with no tracer and no traceparent draws no trace id', async () => {
    services()
    wire('/plain', async () => ({ ok: true }))
    const response = await get('/plain')
    assert.equal(response.status, 200)
    assert.equal(idDraws, 0)
  })

  test('a function reading the wire sees one stable, valid id on wire and trace', async () => {
    services()
    let seen: any
    wire('/read', async (_s, _d, w) => {
      seen = {
        first: w.traceId,
        second: w.traceId,
        trace: w.trace.traceId,
        span: w.trace.spanId,
        spread: { ...w.trace },
        wireCopy: { ...w },
      }
      return {}
    })
    await get('/read')
    assert.match(seen.first, HEX_32)
    assert.equal(seen.second, seen.first)
    assert.equal(seen.trace, seen.first)
    assert.match(seen.span, HEX_16)
    assert.equal(seen.spread.traceId, seen.first)
    assert.equal(seen.spread.spanId, seen.span)
    assert.equal(seen.wireCopy.traceId, seen.first)
  })

  test('an error response echoes the same id the logs and the scoped logger carry', async () => {
    const logs = services()
    wire('/boom', async () => {
      throw new Error('boom')
    })
    const response = await get('/boom', undefined, { exposeErrors: false })
    assert.equal(response.status, 500)
    const { errorId } = (await response.json()) as { errorId: string }
    assert.match(errorId, HEX_32)
    assert.ok(
      logs.some((log) => log.message === `Error id: ${errorId}`),
      'the error id is logged'
    )
    assert.ok(logs.some((log) => log.scope === errorId))
  })

  test('a handled 4xx carries an errorId too', async () => {
    services()
    const response = await get('/missing', undefined, { respondWith404: true })
    assert.equal(response.status, 404)
    const body = (await response.json()) as { errorId: string }
    assert.match(body.errorId, HEX_32)
  })

  test('a job enqueued from the function carries the traceparent of its wire', async () => {
    const added: any[] = []
    services({
      queueService: {
        add: async (_q: string, _d: unknown, o: any) => added.push(o),
      },
    })
    let wireTrace: any
    wire('/enqueue', async (s, _d, w) => {
      await s.queueService.add('q', {}, {})
      wireTrace = { traceId: w.traceId, spanId: w.trace.spanId }
      return {}
    })
    await get('/enqueue')
    assert.equal(
      added[0].traceparent,
      formatTraceparent({ ...wireTrace, sampled: true })
    )
    assert.match(wireTrace.traceId, HEX_32)
  })

  test('with a tracer the span, the wire and the logger scope share one id', async () => {
    const tracer = new RecordingTracer()
    const logs = services({ tracer })
    let wireId: string | undefined
    wire('/traced', async (_s, _d, w) => {
      wireId = w.traceId
      return {}
    })
    await get('/traced')
    assert.ok(tracer.spans.length > 0)
    assert.equal(tracer.spans[0]!.traceId, wireId)
    assert.match(wireId!, HEX_32)
    void logs
  })

  test('a trusted inbound traceparent is concrete and continues the caller trace', async () => {
    services()
    const caller = '4bf92f3577b34da6a3ce929d0e0e4736'
    let wireId: string | undefined
    wire('/inbound', async (_s, _d, w) => {
      wireId = w.traceId
      return {}
    })
    await get(
      '/inbound',
      { headers: { traceparent: `00-${caller}-00f067aa0ba902b7-01` } },
      { trustInboundTraceparent: true }
    )
    assert.equal(wireId, caller)
    assert.equal(idDraws, 0)
  })

  test('assigning wire.traceId adopts a valid id and ignores an invalid one', async () => {
    services()
    const adopted = 'b'.repeat(32)
    let seen: any
    wire('/assign', async (_s, _d, w) => {
      const original = w.traceId
      for (const bad of ['garbage', 'B'.repeat(32), '0'.repeat(32), '', 7]) {
        w.traceId = bad
      }
      const afterBad = { wire: w.traceId, trace: w.trace.traceId }
      w.traceId = adopted
      seen = {
        original,
        afterBad,
        wire: w.traceId,
        trace: w.trace.traceId,
      }
      return {}
    })
    await get('/assign')
    assert.match(seen.original, HEX_32)
    assert.deepEqual(seen.afterBad, {
      wire: seen.original,
      trace: seen.original,
    })
    assert.equal(seen.wire, adopted)
    assert.equal(seen.trace, adopted)
  })

  test('a runtime-provided traceId is used as is', async () => {
    services()
    const provided = 'a'.repeat(32)
    let wireId: string | undefined
    wire('/provided', async (_s, _d, w) => {
      wireId = w.traceId
      return {}
    })
    await get('/provided', undefined, { traceId: provided })
    assert.equal(wireId, provided)
  })

  test('an untrusted traceparent is ignored and a fresh id is issued when read', async () => {
    services()
    let wireId: string | undefined
    wire('/untrusted', async (_s, _d, w) => {
      wireId = w.traceId
      return {}
    })
    await get('/untrusted', {
      headers: { traceparent: `00-${'b'.repeat(32)}-${'c'.repeat(16)}-01` },
    })
    assert.match(wireId!, HEX_32)
    assert.notEqual(wireId, 'b'.repeat(32))
  })

  test('two requests get different ids', async () => {
    services()
    const ids: string[] = []
    wire('/ids', async (_s, _d, w) => {
      ids.push(w.traceId)
      return {}
    })
    await get('/ids')
    await get('/ids')
    assert.notEqual(ids[0], ids[1])
  })
})
