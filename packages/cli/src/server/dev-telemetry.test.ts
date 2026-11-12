import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeTraces } from '@pikku/core/testing'
import { createTrace } from '@pikku/core/trace'
import { createDevTelemetry } from './dev-telemetry.js'

const ENDPOINT = {
  PIKKU_OTLP_ENDPOINT: 'http://127.0.0.1:4318/v1/otlp',
  PIKKU_PROJECT: 'shop',
  PIKKU_STAGE: '_workspace',
}

const capture = () => {
  const requests: { url: string; body: Uint8Array }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({ url, body: init.body as Uint8Array })
    return new Response(null, { status: 200 })
  }) as unknown as typeof fetch
  return { requests, fetchImpl }
}

const serviceName = async (
  options: Parameters<typeof createDevTelemetry>[0]
) => {
  const { requests, fetchImpl } = capture()
  const telemetry = createDevTelemetry({ ...options, fetch: fetchImpl })
  telemetry.tracer.startSpan('fn', createTrace()).end({ code: 'ok' })
  telemetry.stopMetrics()
  await telemetry.flush()
  await telemetry.close()
  const traces = requests.find((r) => r.url.endsWith('/v1/traces'))
  return traces ? decodeTraces(traces.body).resource : undefined
}

test('without an endpoint the dev server has no telemetry', () => {
  const telemetry = createDevTelemetry({
    mode: 'inline',
    env: {},
    rootDir: '/p/shop',
  })
  assert.equal(telemetry.enabled, false)
})

test('the process that serves sends spans with the project and stage of the environment', async () => {
  const resource = await serviceName({
    mode: 'inline',
    env: ENDPOINT,
    rootDir: '/p/shop',
    version: '1.2.3',
  })
  assert.deepEqual(resource!['pikku.project'], { string: 'shop' })
  assert.deepEqual(resource!['pikku.stage'], { string: '_workspace' })
  assert.deepEqual(resource!['service.name'], { string: 'shop' })
  assert.deepEqual(resource!['service.version'], { string: '1.2.3' })
})

test('the parent of several backends is inert even with an endpoint in its environment: its backends send, it does not', async () => {
  const telemetry = createDevTelemetry({
    mode: 'parent',
    env: ENDPOINT,
    rootDir: '/p/shop',
  })
  assert.equal(telemetry.enabled, false)
  assert.equal(
    await serviceName({ mode: 'parent', env: ENDPOINT, rootDir: '/p/shop' }),
    undefined
  )
})

test('each backend names itself in its service name; one backend alone keeps the plain name', async () => {
  const api = await serviceName({
    mode: 'inline',
    env: ENDPOINT,
    rootDir: '/p/shop',
    backend: 'api',
  })
  const worker = await serviceName({
    mode: 'inline',
    env: { ...ENDPOINT, PIKKU_OTLP_SERVICE_NAME: 'shop' },
    rootDir: '/p/shop',
    backend: 'worker',
  })
  assert.deepEqual(api!['service.name'], { string: 'shop.api' })
  assert.deepEqual(worker!['service.name'], { string: 'shop.worker' })
  assert.deepEqual(api!['pikku.project'], { string: 'shop' })
})

test('a non-loopback endpoint stops the process that serves, at boot', () => {
  assert.throws(
    () =>
      createDevTelemetry({
        mode: 'inline',
        env: { PIKKU_OTLP_ENDPOINT: 'https://telemetry.example.com/v1/otlp' },
        rootDir: '/p/shop',
      }),
    /loopback|PIKKU_OTLP_ALLOW_REMOTE/
  )
})
