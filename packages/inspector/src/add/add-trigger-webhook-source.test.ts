import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (errors: string[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string) => {
      errors.push(message)
    },
    diagnostic: () => {},
    critical: (_code: string, message: string) => {
      errors.push(message)
    },
    hasCriticalErrors: () => false,
  }) as unknown as InspectorLogger

const inspectSource = async (source: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-webhook-source-'))
  const file = join(rootDir, 'wiring.ts')
  await writeFile(file, source)
  const errors: string[] = []
  try {
    const state = await inspect(makeLogger(errors), [file], { rootDir })
    return { state, errors }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const HEADER = `import { wireTrigger, wireTriggerWebhookSource } from '@pikku/core/trigger'
const schema = {} as any
`

describe('wireTriggerWebhookSource', () => {
  test('records route, events and inline lifecycle functions', async () => {
    const { state, errors } = await inspectSource(
      HEADER +
        `wireTriggerWebhookSource({
  name: 'shop',
  events: { 'order.paid': schema, 'order.refunded': schema },
  receive: { func: async () => ({ events: [] }) },
  check: { func: async () => ({ status: 'ok' }) },
})
wireTrigger({ name: 'shop:order.paid', func: { func: async () => {} } })
`
    )

    assert.deepEqual(errors, [])
    assert.deepEqual(state.triggers.webhookSourceMeta.shop, {
      name: 'shop',
      method: 'post',
      route: '/webhooks/shop',
      events: ['order.paid', 'order.refunded'],
      receive: 'trigger-webhook:shop:receive',
      check: 'trigger-webhook:shop:check',
    })
    assert.ok(state.functions.meta['trigger-webhook:shop:receive'])
  })

  test('records a ref target as the step id', async () => {
    const { state } = await inspectSource(
      HEADER +
        `declare const ref: (name: string) => any
wireTriggerWebhookSource({ name: 'pay', route: '/hooks/pay', receive: ref('stripe-eu:receiveStripeWebhook') })
`
    )

    assert.equal(
      state.triggers.webhookSourceMeta.pay?.receive,
      'stripe-eu:receiveStripeWebhook'
    )
    assert.equal(state.triggers.webhookSourceMeta.pay?.route, '/hooks/pay')
  })

  test('rejects a trigger for an undeclared event', async () => {
    const { errors } = await inspectSource(
      HEADER +
        `wireTriggerWebhookSource({ name: 'shop', events: { 'order.paid': schema } })
wireTrigger({ name: 'shop:order.lost', func: { func: async () => {} } })
`
    )

    assert.equal(errors.length, 1)
    assert.match(
      errors[0]!,
      /Trigger 'shop:order.lost' listens for 'order.lost'/
    )
  })
})

describe('wireTriggerWebhookSource method shorthand', () => {
  test('keeps an array of methods as an array, not its source text', async () => {
    const { state, errors } = await inspectSource(
      HEADER +
        `wireTriggerWebhookSource({
  name: 'dual',
  method: ['get', 'post'],
  receive: { func: async () => ({ events: [] }) },
})
`
    )

    assert.deepEqual(errors, [])
    assert.deepEqual(state.triggers.webhookSourceMeta.dual?.method, [
      'get',
      'post',
    ])
  })
})
