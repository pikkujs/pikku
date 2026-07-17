import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeWebhook } from './serialize-webhook.js'

describe('serializeWebhook', () => {
  test('wires the pikku-outgoing-webhooks queue worker around the core delivery function', () => {
    const output = serializeWebhook('./pikku-types.gen.js')
    assert.ok(
      output.includes('wireQueueWorker'),
      'expected wireQueueWorker to be imported and called'
    )
    assert.ok(
      output.includes("name: 'pikku-outgoing-webhooks'"),
      'expected a queue worker for the pikku-outgoing-webhooks queue'
    )
    assert.ok(
      output.includes('pikkuWebhookWorkerFunc'),
      'expected the worker to delegate to the core pikkuWebhookWorkerFunc'
    )
    assert.ok(
      output.includes('@pikku/core/services'),
      'expected the core worker function to be imported from @pikku/core/services'
    )
    assert.ok(output.includes("tags: ['pikku']"))
  })

  test('imports the wiring helpers from the generated pikku types path', () => {
    const output = serializeWebhook('./pikku-types.gen.js')
    assert.ok(output.includes("from './pikku-types.gen.js'"))
    assert.ok(
      !output.includes('wireHTTP'),
      'outgoing webhooks have no HTTP surface'
    )
  })

  test('inlines the delivery function into the single wiring that uses it', () => {
    const output = serializeWebhook('./pikku-types.gen.js')
    assert.ok(
      !output.includes('export const'),
      'the worker is wired once, so it needs no named export to reference'
    )
  })

  test('types the job payload with an inline TS literal, never an imported type or zod', () => {
    const output = serializeWebhook('./pikku-types.gen.js')
    assert.ok(output.includes('pikkuSessionlessFunc<'))
    assert.ok(output.includes('url: string'))
    assert.ok(
      !output.includes("from 'zod'"),
      'a zod schema would make the inspector import this file at codegen time, breaking on stale deploy-unit pikku-types imports'
    )
    assert.ok(
      !output.includes('WebhookJobData'),
      'importing the payload type from @pikku/core would leave the inspector unable to generate its schema'
    )
  })
})
