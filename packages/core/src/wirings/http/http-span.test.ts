import { test, describe, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { ConflictError, NotFoundError } from '../../errors/errors.js'
import { fetch, wireHTTP } from './http-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addFunction } from '../../function/function-runner.js'
import { httpRouter } from './routers/http-router.js'
import { RecordingTracer } from '../../testing/recording-tracer.js'

const tracer = new RecordingTracer()

const wire = (route: string, func: () => Promise<unknown>) => {
  const id = `fn${route.replace(/\W/g, '_')}`
  pikkuState(null, 'function', 'meta')[id] = {
    pikkuFuncId: id,
    inputSchemaName: null,
    outputSchemaName: null,
    sessionless: true,
  } as any
  pikkuState(null, 'http', 'meta')['get'][route] = {
    pikkuFuncId: id,
    route,
    method: 'get',
  } as any
  addFunction(id, { func })
  wireHTTP({ route, method: 'get', auth: false, func: { func } as any })
  httpRouter.initialize()
}

const get = async (route: string) => {
  const response = await fetch(new Request(`http://localhost${route}`))
  return response.status
}

describe('the http span against a real error response', () => {
  beforeEach(() => {
    resetPikkuState()
    httpRouter.reset()
    tracer.spans.length = 0
    pikkuState(null, 'package', 'singletonServices', {
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      tracer,
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)
  })

  test('a 404 thrown by the function ends the span with status 404', async () => {
    wire('/missing', async () => {
      throw new NotFoundError()
    })
    assert.equal(await get('/missing'), 404)
    const [span] = tracer.spans
    assert.equal(span!.status.code, 'error')
    assert.equal(span!.attributes['http.response.status_code'], 404)
  })

  test('a 409 carries its registered status', async () => {
    wire('/conflict', async () => {
      throw new ConflictError()
    })
    assert.equal(await get('/conflict'), 409)
    assert.equal(tracer.spans[0]!.attributes['http.response.status_code'], 409)
  })

  test('an unknown error is a 500', async () => {
    wire('/boom', async () => {
      throw new Error('boom')
    })
    assert.equal(await get('/boom'), 500)
    assert.equal(tracer.spans[0]!.attributes['http.response.status_code'], 500)
  })

  test('a success ends with the response status', async () => {
    wire('/fine', async () => ({ ok: true }))
    assert.equal(await get('/fine'), 200)
    assert.equal(tracer.spans[0]!.status.code, 'ok')
    assert.equal(tracer.spans[0]!.attributes['http.response.status_code'], 200)
    assert.equal(tracer.spans[0]!.attributes['http.request.method'], 'get')
  })
})
