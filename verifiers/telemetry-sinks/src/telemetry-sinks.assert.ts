import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import '../.pikku/pikku-bootstrap.gen.js'
import { fetch } from '@pikku/core/http'
import { createRuntimeTelemetry } from '@pikku/core/otlp'
import { ConsoleLogger } from '@pikku/core/services'
import { createPlatformServices } from '../.pikku/providers/pikku-dev-providers.gen.js'
import { conversions } from './providers.js'
import {
  createConfig,
  createSingletonServices,
  ended,
  resources,
  started,
} from './services.js'

/**
 * The host path of `pikku dev`, `pikku serve` and a standalone build: core
 * builds the runtime telemetry before the app's createSingletonServices runs,
 * with PIKKU_OTLP_ENDPOINT unset, and hands it in with what the providers
 * built. The app registers its OTLP sinks in plain code and adds its analytics
 * sink as a provider.
 */
const quiet = new ConsoleLogger()
quiet.setLevel(5)

before(async () => {
  const telemetry = createRuntimeTelemetry(
    {},
    { logger: quiet, serviceName: 'sinks-verifier' }
  )
  telemetry.stopMetrics()
  const platform = await createPlatformServices({}, { logger: quiet })
  await createSingletonServices(await createConfig(), {
    ...platform,
    logger: quiet,
    tracer: telemetry.tracer,
    otlpSinks: telemetry.otlpSinks,
  } as never)
})

describe('sinks registered in createSingletonServices', () => {
  test('see a function span start, end and carry the service name, with no OTLP endpoint', async () => {
    const response = await fetch(
      new Request('http://localhost/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 42 }),
      })
    )
    assert.equal(response.status, 200)

    assert.deepEqual(resources, ['sinks-verifier'])
    const functionSpan = ended.find(
      (span) => span.attributes['pikku.function.id'] === 'checkout'
    )
    assert.ok(functionSpan, `no checkout span in ${ended.map((s) => s.name)}`)
    assert.ok(
      started.some((span) => span.spanId === functionSpan.spanId),
      'onSpanStart saw the span before it ended'
    )
  })

  test('an analytics sink receives only the events its map names', async () => {
    assert.deepEqual(
      conversions.map((record) => record.name),
      ['checkout_completed']
    )
    assert.equal(conversions[0]!.props?.amount, 42)
  })
})
