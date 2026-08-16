import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeWebhook } from './serialize-webhook.js'

describe('serializeWebhook', () => {
  test('wires the pikku-outgoing-webhooks queue worker around the core delivery function', () => {
    const { functions } = serializeWebhook(
      (name: string) => `./${name}/index.js`
    )
    assert.ok(
      functions.includes('wireQueueWorker'),
      'expected wireQueueWorker to be imported and called'
    )
    assert.ok(
      functions.includes("name: 'pikku-outgoing-webhooks'"),
      'expected a queue worker for the pikku-outgoing-webhooks queue'
    )
    assert.ok(
      functions.includes('pikkuWebhookWorkerFunc'),
      'expected the worker to delegate to the core pikkuWebhookWorkerFunc'
    )
    assert.ok(
      functions.includes('@pikku/core/services'),
      'expected the core worker function to be imported from @pikku/core/services'
    )
    assert.ok(functions.includes("tags: ['pikku']"))
  })

  test('imports each wiring helper from its own leaf', () => {
    const { functions } = serializeWebhook(
      (name: string) => `./${name}/index.js`
    )
    assert.ok(
      functions.includes(
        "import { pikkuSessionlessFunc } from './function/index.js'"
      )
    )
    assert.ok(
      functions.includes("import { wireQueueWorker } from './queue/index.js'")
    )
    assert.ok(
      !functions.includes('wireHTTP'),
      'outgoing webhooks have no HTTP surface'
    )
  })

  test('inlines the delivery function into the single wiring that uses it', () => {
    const { functions } = serializeWebhook(
      (name: string) => `./${name}/index.js`
    )
    assert.ok(
      !functions.includes('export const'),
      'the worker is wired once, so it needs no named export to reference'
    )
  })

  test('describes the job payload with a zod schema from the sibling module', () => {
    const { schemas, functions } = serializeWebhook(
      (name: string) => `./${name}/index.js`
    )
    assert.ok(schemas.includes("import { z } from 'zod'"))
    assert.ok(schemas.includes('export const WebhookDelivery = z.object({'))
    assert.ok(functions.includes('input: WebhookDelivery'))
    assert.ok(
      functions.includes("from './webhook.schemas.gen.js'"),
      'the wiring reads the schema from its sibling module'
    )
    assert.ok(
      !functions.includes('pikkuSessionlessFunc<'),
      'schemas and generics are mutually exclusive'
    )
  })

  test('keeps the schemas module free of anything but zod', () => {
    const { schemas } = serializeWebhook((name: string) => `./${name}/index.js`)
    assert.ok(
      !schemas.includes('pikku-types.gen.js'),
      'the inspector imports this module directly, so it must not reach for a path deploy codegen rewrites'
    )
    assert.ok(!schemas.includes('@pikku/core'))
  })
})
