import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import {
  QueueWebhookService,
  pikkuWebhookWorkerFunc,
} from './queue-webhook-service.js'
import {
  PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
  type WebhookJobData,
} from './webhook-service.js'
import { InMemoryQueueService } from './in-memory-queue-service.js'
import { wireQueueWorker } from '../wirings/queue/queue-runner.js'
import { resetPikkuState, pikkuState } from '../pikku-state.js'
import type { JobOptions } from '../wirings/queue/queue.types.js'

const noopLogger = { error() {}, info() {}, warn() {}, debug() {} }

interface CapturedAdd {
  queueName: string
  data: WebhookJobData
  options?: JobOptions
}

const setupServices = (overrides: Record<string, unknown> = {}) => {
  const added: CapturedAdd[] = []
  const queueService = {
    supportsResults: false,
    add: async (
      queueName: string,
      data: WebhookJobData,
      options?: JobOptions
    ) => {
      added.push({ queueName, data, options })
      return 'job-1'
    },
    getJob: async () => null,
  }
  pikkuState(null, 'package', 'singletonServices', {
    logger: noopLogger,
    config: {},
    secrets: {
      getSecret: async (key: string) => {
        throw new Error(`Secret not found: ${key}`)
      },
    },
    queueService,
    ...overrides,
  } as any)
  return { added, queueService }
}

beforeEach(() => {
  resetPikkuState()
})

describe('QueueWebhookService.send', () => {
  test('enqueues with defaults: pikku-outgoing-webhooks queue, 3 retries, exponential backoff', async () => {
    const { added, queueService } = setupServices()
    const webhookService = new QueueWebhookService(queueService as any)

    const result = await webhookService.send({
      url: 'https://example.com/hook',
      event: 'user.created',
      data: { id: 'u1' },
    })

    assert.equal(result.jobId, 'job-1')
    assert.equal(added.length, 1)
    const { queueName, data, options } = added[0]!
    assert.equal(queueName, PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME)
    assert.equal(queueName, 'pikku-outgoing-webhooks')
    assert.equal(data.url, 'https://example.com/hook')
    assert.equal(data.body, JSON.stringify({ id: 'u1' }))
    assert.equal(data.headers['Content-Type'], 'application/json')
    assert.equal(data.headers['X-Pikku-Event'], 'user.created')
    assert.equal(options?.attempts, 4)
    assert.equal(options?.backoff, 'exponential')
  })

  test('applies config defaults for retries and fixed retryDelay', async () => {
    const { added, queueService } = setupServices({
      config: { webhook: { retries: 1, retryDelay: '30s' } },
    })
    const webhookService = new QueueWebhookService(queueService as any)

    await webhookService.send({ url: 'https://example.com/hook', data: {} })

    const { options } = added[0]!
    assert.equal(options?.attempts, 2)
    assert.deepEqual(options?.backoff, { type: 'fixed', delay: 30000 })
  })

  test('per-call retries override config defaults', async () => {
    const { added, queueService } = setupServices({
      config: { webhook: { retries: 5 } },
    })
    const webhookService = new QueueWebhookService(queueService as any)

    await webhookService.send({
      url: 'https://example.com/hook',
      data: {},
      retries: 0,
    })

    const { options } = added[0]!
    assert.equal(options?.attempts, 1)
    assert.equal(options?.backoff, undefined)
  })

  test('per-call secret signs the body and never enters the job data', async () => {
    const { added, queueService } = setupServices()
    const webhookService = new QueueWebhookService(queueService as any)

    await webhookService.send({
      url: 'https://example.com/hook',
      data: { id: 'u1' },
      secret: 'shhh',
    })

    const { data } = added[0]!
    const expected =
      'sha256=' + createHmac('sha256', 'shhh').update(data.body).digest('hex')
    assert.equal(data.headers['X-Pikku-Signature'], expected)
    assert.ok(!JSON.stringify(data).includes('shhh'))
  })

  test('config secret is a secret NAME resolved through the secrets service', async () => {
    const { added, queueService } = setupServices({
      config: { webhook: { secret: 'WEBHOOK_SIGNING_KEY' } },
      secrets: {
        getSecret: async (key: string) => {
          assert.equal(key, 'WEBHOOK_SIGNING_KEY')
          return 'resolved-key'
        },
      },
    })
    const webhookService = new QueueWebhookService(queueService as any)

    await webhookService.send({ url: 'https://example.com/hook', data: {} })

    const { data } = added[0]!
    assert.ok(
      webhookService.verify(
        'resolved-key',
        data.headers['X-Pikku-Signature']!,
        data.body
      )
    )
  })

  test('config.webhook.signatureHeader overrides the default header', async () => {
    const { added, queueService } = setupServices({
      config: { webhook: { signatureHeader: 'X-Acme-Signature' } },
    })
    const webhookService = new QueueWebhookService(queueService as any)

    await webhookService.send({
      url: 'https://example.com/hook',
      data: {},
      secret: 'shhh',
    })

    const { data } = added[0]!
    assert.ok(
      webhookService.verify(
        'shhh',
        data.headers['X-Acme-Signature']!,
        data.body
      )
    )
    assert.equal(data.headers['X-Pikku-Signature'], undefined)
  })

  test('no secret anywhere means no signature header', async () => {
    const { added, queueService } = setupServices()
    const webhookService = new QueueWebhookService(queueService as any)

    await webhookService.send({ url: 'https://example.com/hook', data: {} })

    assert.equal(added[0]!.data.headers['X-Pikku-Signature'], undefined)
  })
})

describe('WebhookService signing', () => {
  test('sign/verify round-trips and rejects tampering', () => {
    const { queueService } = setupServices()
    // sign() is protected — reach it the way a subclass would.
    const webhookService = new (class extends QueueWebhookService {
      public signBody = (secret: string, body: string) =>
        this.sign(secret, body)
    })(queueService as any)

    const signature = webhookService.signBody('key', '{"a":1}')

    assert.ok(signature.startsWith('sha256='))
    assert.equal(webhookService.verify('key', signature, '{"a":1}'), true)
    assert.equal(webhookService.verify('key', signature, '{"a":2}'), false)
    assert.equal(webhookService.verify('other', signature, '{"a":1}'), false)
    assert.equal(webhookService.verify('key', 'sha256=nope', '{"a":1}'), false)
  })
})

describe('pikkuWebhookWorkerFunc', () => {
  const originalFetch = globalThis.fetch

  const stubFetch = (
    handler: (url: string, init: RequestInit) => { status: number }
  ) => {
    const requests: { url: string; init: RequestInit }[] = []
    globalThis.fetch = (async (url: any, init: any) => {
      requests.push({ url: String(url), init })
      const { status } = handler(String(url), init)
      return new Response(null, { status })
    }) as typeof fetch
    return requests
  }

  const restoreFetch = () => {
    globalThis.fetch = originalFetch
  }

  test('POSTs the stored body and headers, resolves on 2xx', async (t) => {
    t.after(restoreFetch)
    const requests = stubFetch(() => ({ status: 204 }))

    await pikkuWebhookWorkerFunc({} as any, {
      url: 'https://example.com/hook',
      body: '{"id":"u1"}',
      headers: { 'Content-Type': 'application/json', 'X-Pikku-Event': 'e' },
    })

    assert.equal(requests.length, 1)
    assert.equal(requests[0]!.url, 'https://example.com/hook')
    assert.equal(requests[0]!.init.method, 'POST')
    assert.equal(requests[0]!.init.body, '{"id":"u1"}')
    assert.equal(
      (requests[0]!.init.headers as Record<string, string>)['X-Pikku-Event'],
      'e'
    )
  })

  test('throws on non-2xx statuses so the queue retries', async (t) => {
    t.after(restoreFetch)

    stubFetch(() => ({ status: 500 }))
    await assert.rejects(
      pikkuWebhookWorkerFunc({} as any, {
        url: 'https://example.com/hook',
        body: '{}',
        headers: {},
      }),
      /500/
    )

    stubFetch(() => ({ status: 302 }))
    await assert.rejects(
      pikkuWebhookWorkerFunc({} as any, {
        url: 'https://example.com/hook',
        body: '{}',
        headers: {},
      }),
      /302/
    )
  })

  test('delivers through the in-memory queue with retries until success', async (t) => {
    t.after(restoreFetch)
    resetPikkuState()

    let attempts = 0
    stubFetch(() => {
      attempts++
      return { status: attempts <= 2 ? 500 : 200 }
    })

    const queueService = new InMemoryQueueService()
    pikkuState(null, 'package', 'singletonServices', {
      logger: noopLogger,
      config: {},
      queueService,
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)

    const funcId = `queue_${PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME}`
    pikkuState(null, 'queue', 'meta')[PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME] = {
      pikkuFuncId: funcId,
      name: PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
    }
    pikkuState(null, 'function', 'meta')[funcId] = {
      pikkuFuncId: funcId,
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    } as any
    wireQueueWorker({
      name: PIKKU_OUTGOING_WEBHOOK_QUEUE_NAME,
      func: { auth: false, func: pikkuWebhookWorkerFunc },
    } as any)

    const webhookService = new QueueWebhookService(queueService)
    await webhookService.send({
      url: 'https://example.com/hook',
      data: { id: 'u1' },
      retries: 3,
      retryDelay: 1,
    })

    const deadline = Date.now() + 2000
    while (attempts < 3 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(attempts, 3, 'should retry twice then stop after success')
  })
})
