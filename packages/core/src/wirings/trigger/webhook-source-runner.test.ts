import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import {
  dispatchWebhookSourceJob,
  receiveWebhookSourceRequest,
  runWebhookSourceLifecycle,
  reconcileTriggerSources,
  reconcileWebhookRegistrations,
  teardownTriggerSources,
  subscribedWebhookEvents,
  wireTriggerWebhookSource,
} from './webhook-source-runner.js'
import { addFunction } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { IncomingWebhookService } from '../../services/incoming-webhook-service.js'
import { InMemoryTriggerSourceStore } from '../../services/trigger-source-store.js'
import { LocalCredentialService } from '../../services/local-credential-service.js'
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
      check: 'shop:check',
      setup: 'shop:setup',
    })
    wireTriggerMeta('shop:paid', () => {})
    registerFunction('shop:check', () => ({ status: 'missing' }))
    registerFunction('shop:setup', (_services, data) => {
      input = data
      return { status: 'created', state: { id: 'we_1' } }
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

describe('reconcileTriggerSources / teardownTriggerSources', () => {
  const withStore = () => {
    const triggerSourceStore = new InMemoryTriggerSourceStore()
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      triggerSourceStore,
    } as never)
    return triggerSourceStore
  }
  const lifecycle = { baseUrl: 'https://shop.test', labelPrefix: 'p' }

  test('sets up declared sources, then tears one down with its state', async () => {
    const store = withStore()
    let teardownInput: any
    setWebhookSourceMeta({
      name: 'shop',
      setup: 'shop:setup',
      teardown: 'shop:teardown',
    })
    registerFunction('shop:setup', () => ({
      status: 'created',
      state: { id: 'we_1' },
    }))
    registerFunction('shop:teardown', (_services, data) => {
      teardownInput = data
      return { status: 'deleted' }
    })

    await reconcileTriggerSources(lifecycle)
    const row = await store.getTriggerSource('shop')
    assert.equal(row!.status, 'created')
    assert.deepEqual(row!.state, { id: 'we_1' })

    await teardownTriggerSources({ names: ['shop'], ...lifecycle })
    assert.deepEqual(teardownInput, {
      label: 'p:shop',
      previous: { id: 'we_1' },
    })
    assert.equal(await store.getTriggerSource('shop'), null)
  })

  test('keeps the state when setup fails, and marks orphans', async () => {
    const store = withStore()
    await store.syncTriggerSources([{ name: 'gone', kind: 'webhook' }])
    setWebhookSourceMeta({ name: 'shop', setup: 'shop:setup' })
    registerFunction('shop:setup', () => {
      throw new Error('bad key')
    })

    const [outcome] = await reconcileTriggerSources(lifecycle)

    assert.equal(outcome!.status, 'failed')
    const rows = await store.listTriggerSources()
    assert.deepEqual(
      rows.map((r) => [r.name, r.declared, r.status, r.detail]),
      [
        ['gone', false, null, null],
        ['shop', true, 'failed', 'bad key'],
      ]
    )
  })
})

describe('reconcileWebhookRegistrations', () => {
  const lifecycle = { baseUrl: 'https://dev.test', labelPrefix: 'dev-sam' }

  const withCredentials = () => {
    const credentialService = new LocalCredentialService()
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      credentialService,
    } as never)
    pikkuState(null, 'package', 'credentialsMeta', {
      shopWebhookSecret: {
        name: 'shopWebhookSecret',
        displayName: 'Shop signing secret',
        type: 'singleton',
      },
      shopOauth: {
        name: 'shopOauth',
        displayName: 'Shop OAuth',
        type: 'singleton',
        oauth2: true,
      },
    })
    return credentialService
  }

  const shopSource = () => {
    let setups = 0
    setWebhookSourceMeta({
      name: 'shop',
      events: ['paid'],
      setup: 'shop:setup',
    })
    wireTriggerMeta('shop:paid', () => {})
    registerFunction('shop:setup', async ({ credentialService }) => {
      setups++
      await credentialService.set('shopWebhookSecret', `whsec_${setups}`)
      return { status: 'created', state: { id: `we_${setups}` } }
    })
    return () => setups
  }

  test('records what setup registered, with the secret it stored', async () => {
    const credentials = withCredentials()
    await credentials.set('shopOauth', { token: 't' })
    shopSource()

    const { registrations, outcomes } = await reconcileWebhookRegistrations({
      ...lifecycle,
      registrations: {},
    })

    assert.equal(outcomes[0]!.status, 'created')
    assert.deepEqual(registrations, {
      shop: {
        url: 'https://dev.test/webhooks/shop',
        events: ['paid'],
        status: 'created',
        state: { id: 'we_1' },
        credentials: { shopWebhookSecret: 'whsec_1' },
      },
    })
  })

  test('leaves a matching registration alone and refills a wiped secret', async () => {
    const credentials = withCredentials()
    const setups = shopSource()
    const { registrations } = await reconcileWebhookRegistrations({
      ...lifecycle,
      registrations: {},
    })
    await credentials.delete('shopWebhookSecret')

    const again = await reconcileWebhookRegistrations({
      ...lifecycle,
      registrations,
    })

    assert.equal(setups(), 1)
    assert.equal(again.outcomes[0]!.status, 'unchanged')
    assert.deepEqual(again.registrations, registrations)
    assert.equal(await credentials.get('shopWebhookSecret'), 'whsec_1')
  })

  test('sets up again when the url or events change, passing the old state', async () => {
    withCredentials()
    const setups = shopSource()
    const { registrations } = await reconcileWebhookRegistrations({
      ...lifecycle,
      registrations: {},
    })
    let previous: any
    registerFunction('shop:setup', (_services, data) => {
      previous = data.previous
      return { status: 'updated' }
    })

    const moved = await reconcileWebhookRegistrations({
      ...lifecycle,
      baseUrl: 'https://tunnel.test',
      registrations,
    })

    assert.equal(setups(), 1)
    assert.deepEqual(previous, { id: 'we_1' })
    assert.equal(
      moved.registrations.shop!.url,
      'https://tunnel.test/webhooks/shop'
    )
    assert.deepEqual(moved.registrations.shop!.state, { id: 'we_1' })
  })

  test('retries a failed registration', async () => {
    withCredentials()
    const setups = shopSource()

    await reconcileWebhookRegistrations({
      ...lifecycle,
      registrations: {
        shop: {
          url: 'https://dev.test/webhooks/shop',
          events: ['paid'],
          status: 'failed',
        },
      },
    })

    assert.equal(setups(), 1)
  })

  test('keeps registrations no source declares and reports them', async () => {
    withCredentials()
    const gone = {
      url: 'https://dev.test/webhooks/gone',
      events: [],
      status: 'created' as const,
      state: { id: 'we_old' },
    }

    const { registrations, orphans } = await reconcileWebhookRegistrations({
      ...lifecycle,
      registrations: { gone },
    })

    assert.deepEqual(registrations, { gone })
    assert.deepEqual(orphans, [
      {
        source: 'gone',
        url: 'https://dev.test/webhooks/gone',
        label: 'dev-sam:gone',
      },
    ])
  })
})
