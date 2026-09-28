import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  dispatchWebhookSourceJob,
  receiveWebhookSourceRequest,
  runWebhookSourceLifecycle,
  subscribedWebhookEvents,
  wireTriggerWebhookSource,
} from './webhook-source-runner.js'
import { addFunction } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { IncomingWebhookService } from '../../services/incoming-webhook-service.js'
import type { QueueService } from '../queue/queue.types.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const registerFunction = (
  funcName: string,
  func: (services: any, data: any, wire: any) => Promise<unknown> | unknown
) => {
  addFunction(funcName, { func } as never)
  pikkuState(null, 'function', 'meta')[funcName] = {
    name: funcName,
    sessionless: true,
    permissions: [],
  } as never
}

const wireTriggerMeta = (name: string, func: (data: any) => unknown) => {
  registerFunction(`trigger:${name}`, (_services, data) => func(data))
  ;(pikkuState(null, 'trigger', 'meta') as any)[name] = {
    pikkuFuncId: `trigger:${name}`,
  }
}

const amountSchema: StandardSchemaV1<unknown, { amount: number }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value: any) =>
      typeof value?.amount === 'number'
        ? { value: { amount: value.amount } }
        : { issues: [{ message: 'amount must be a number' }] },
  },
}

const httpWire = (body: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(body))
  return {
    http: {
      request: {
        arrayBuffer: async () => bytes.buffer,
        headers: () => ({ 'content-type': 'application/json' }),
        method: () => 'post',
        path: () => '/webhooks/shop',
        query: () => ({}),
      },
    } as any,
  }
}

const queued: Array<{ name: string; data: any; jobId?: string }> = []
const queueService = {
  add: async (name: string, data: any, options?: { jobId?: string }) => {
    queued.push({ name, data, jobId: options?.jobId })
    return options?.jobId ?? 'job'
  },
} as unknown as QueueService

const setWebhookSourceMeta = (meta: Record<string, unknown>) => {
  ;(pikkuState(null, 'trigger', 'webhookSourceMeta') as any)[
    meta.name as string
  ] = {
    method: 'post',
    route: `/webhooks/${meta.name}`,
    events: [],
    ...meta,
  }
}

beforeEach(() => {
  resetPikkuState()
  queued.length = 0
  pikkuState(null, 'package', 'singletonServices', {
    logger,
    incomingWebhookService: new IncomingWebhookService(queueService),
  } as never)
})

describe('wireTriggerWebhookSource', () => {
  test('skips a source without metadata', () => {
    const originalWarn = console.warn
    console.warn = () => {}
    try {
      wireTriggerWebhookSource({ name: 'missing' })
    } finally {
      console.warn = originalWarn
    }
    assert.equal(pikkuState(null, 'trigger', 'webhookSources').size, 0)
  })

  test('registers inline steps but not ref() steps', () => {
    setWebhookSourceMeta({
      name: 'shop',
      receive: 'shop:receive',
      check: 'addon:check',
    })
    wireTriggerWebhookSource({
      name: 'shop',
      receive: { func: async () => ({ events: [] }) },
      check: { rpcName: 'addon:check' } as never,
    })
    const functions = pikkuState(null, 'function', 'functions')
    assert.ok(functions.has('shop:receive'))
    assert.ok(!functions.has('addon:check'))
  })

  test('throws on a duplicate source', () => {
    setWebhookSourceMeta({ name: 'shop' })
    wireTriggerWebhookSource({ name: 'shop' })
    assert.throws(() => wireTriggerWebhookSource({ name: 'shop' }), {
      message: 'Webhook source already exists: shop',
    })
  })
})

describe('subscribedWebhookEvents', () => {
  test('lists only the events some trigger is wired to', () => {
    setWebhookSourceMeta({ name: 'shop', events: ['paid', 'refunded'] })
    wireTriggerMeta('shop:paid', () => {})
    assert.deepEqual(subscribedWebhookEvents('shop'), ['paid'])
  })
})

describe('receiveWebhookSourceRequest', () => {
  test('queues the JSON body for the source trigger by default', async () => {
    setWebhookSourceMeta({ name: 'shop' })
    wireTriggerWebhookSource({ name: 'shop' })
    wireTriggerMeta('shop', () => {})

    const result = await receiveWebhookSourceRequest(
      'shop',
      httpWire({ amount: 5 })
    )

    assert.deepEqual(result, { received: 1 })
    assert.equal(queued[0]!.name, 'pikku-incoming-webhooks')
    assert.deepEqual(queued[0]!.data, {
      source: 'shop',
      event: { name: '', data: { amount: 5 } },
    })
  })

  test('answers a handshake without queueing', async () => {
    setWebhookSourceMeta({ name: 'shop', receive: 'shop:receive' })
    registerFunction('shop:receive', () => ({
      respond: { status: 200, body: 'challenge' },
    }))

    const result = await receiveWebhookSourceRequest('shop', httpWire({}))

    assert.ok(result instanceof Response)
    assert.equal(await result.text(), 'challenge')
    assert.equal(queued.length, 0)
  })

  test('drops unlistened and invalid events, keys jobs by event id', async () => {
    setWebhookSourceMeta({
      name: 'shop',
      events: ['paid', 'refunded'],
      receive: 'shop:receive',
    })
    wireTriggerWebhookSource({
      name: 'shop',
      events: { paid: amountSchema, refunded: amountSchema },
    })
    wireTriggerMeta('shop:paid', () => {})
    registerFunction('shop:receive', (_services, request) => {
      assert.ok(request.body instanceof Uint8Array)
      return {
        events: [
          { name: 'paid', id: 'evt_1', data: { amount: 5 } },
          { name: 'paid', id: 'evt_2', data: { amount: 'five' } },
          { name: 'refunded', id: 'evt_3', data: { amount: 5 } },
        ],
      }
    })

    const result = await receiveWebhookSourceRequest('shop', httpWire({}))

    assert.deepEqual(result, { received: 1 })
    assert.equal(queued.length, 1)
    assert.equal(queued[0]!.jobId, 'shop:paid:evt_1')
  })
})

describe('dispatchWebhookSourceJob', () => {
  test('runs the trigger the event was queued for', async () => {
    const received: unknown[] = []
    wireTriggerMeta('shop:paid', (data) => {
      received.push(data)
    })

    await dispatchWebhookSourceJob({
      source: 'shop',
      event: { name: 'paid', data: { amount: 5 } },
    })

    assert.deepEqual(received, [{ amount: 5 }])
  })

  test('rethrows so the queue retries, recording the attempt', async () => {
    const attempts: unknown[] = []
    const service = new IncomingWebhookService(queueService)
    service.recordAttempt = async (receiptId, attempt) => {
      attempts.push({ receiptId, ...attempt })
    }
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      incomingWebhookService: service,
    } as never)
    wireTriggerMeta('shop:paid', () => {
      throw new Error('boom')
    })

    await assert.rejects(
      dispatchWebhookSourceJob({
        source: 'shop',
        event: { name: 'paid', data: {} },
        receiptId: 'r1',
      }),
      { message: 'boom' }
    )
    assert.deepEqual(attempts, [
      { receiptId: 'r1', trigger: 'shop:paid', error: 'boom' },
    ])
  })
})

describe('runWebhookSourceLifecycle', () => {
  test('skips setup when check reports ok', async () => {
    let setups = 0
    setWebhookSourceMeta({
      name: 'shop',
      events: ['paid'],
      check: 'shop:check',
      setup: 'shop:setup',
    })
    registerFunction('shop:check', () => ({ status: 'ok' }))
    registerFunction('shop:setup', () => {
      setups++
      return { status: 'created' }
    })

    const outcomes = await runWebhookSourceLifecycle({
      action: 'setup',
      baseUrl: 'https://shop.test/api/',
      labelPrefix: 'shop-prod',
    })

    assert.equal(setups, 0)
    assert.deepEqual(outcomes, [
      {
        source: 'shop',
        url: 'https://shop.test/api/webhooks/shop',
        status: 'unchanged',
      },
    ])
  })

  test('sets up a missing endpoint with the subscribed events', async () => {
    let input: any
    setWebhookSourceMeta({
      name: 'shop',
      events: ['paid', 'refunded'],
      secret: 'SHOP_WEBHOOK_SECRET',
      check: 'shop:check',
      setup: 'shop:setup',
    })
    wireTriggerMeta('shop:paid', () => {})
    registerFunction('shop:check', () => ({ status: 'missing' }))
    registerFunction('shop:setup', (_services, data) => {
      input = data
      return { status: 'created', state: { id: 'we_1' }, secret: 'whsec' }
    })

    const [outcome] = await runWebhookSourceLifecycle({
      action: 'setup',
      baseUrl: 'https://shop.test',
      labelPrefix: 'shop-prod',
    })

    assert.deepEqual(input, {
      url: 'https://shop.test/webhooks/shop',
      label: 'shop-prod:shop',
      events: ['paid'],
    })
    assert.deepEqual(outcome, {
      source: 'shop',
      url: 'https://shop.test/webhooks/shop',
      status: 'created',
      state: { id: 'we_1' },
      secretName: 'SHOP_WEBHOOK_SECRET',
      secret: 'whsec',
    })
  })

  test('reports manual without setup and failed on a throw', async () => {
    setWebhookSourceMeta({ name: 'manual' })
    setWebhookSourceMeta({ name: 'broken', check: 'broken:check' })
    registerFunction('broken:check', () => {
      throw new Error('no key')
    })

    const outcomes = await runWebhookSourceLifecycle({
      action: 'setup',
      baseUrl: 'https://shop.test',
      labelPrefix: 'p',
    })

    assert.equal(outcomes[0]!.status, 'manual')
    assert.deepEqual(outcomes[1], {
      source: 'broken',
      url: 'https://shop.test/webhooks/broken',
      status: 'failed',
      error: 'no key',
    })
  })
})
