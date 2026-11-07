import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { LocalVariablesService } from '@pikku/core/services'
import { createScriptContent, getText, putText } from './script-content.js'
import { after, before, beforeEach, describe, test } from 'node:test'

const variables = new LocalVariablesService()
const scratch = join(
  import.meta.dirname,
  '../.pikku-runtime',
  `webhook-source-${randomUUID()}`
)
const content = createScriptContent(scratch)
variables.set('WEBHOOK_SCRATCH_DIR', scratch)
await putText(
  content,
  'credentials',
  'credentials.json',
  JSON.stringify({ shopWebhookSecret: 'shop-signing-secret' })
)

import '../.pikku/pikku-bootstrap.gen.js'
import { fetch } from '@pikku/core/http'
import { pikkuState } from '@pikku/core/state'
import { createConfig, createSingletonServices } from './services.js'
import { failNextOrders, firedOrders } from './shop.webhook-source.js'
import { readEndpoints, writeEndpoints } from './fake-provider.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pikkuBin = join(
  root,
  'node_modules',
  '@pikku',
  'cli',
  'dist',
  'bin',
  'pikku.js'
)

const storedCredentials = async (): Promise<Record<string, unknown>> =>
  JSON.parse(await getText(content, 'credentials', 'credentials.json'))

const sign = (body: string, secret = 'shop-signing-secret') =>
  createHmac('sha256', secret).update(body).digest('hex')

const post = (payload: unknown, signature?: string) => {
  const body = JSON.stringify(payload)
  return fetch(
    new Request('http://localhost/webhooks/shop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shop-signature': signature ?? sign(body),
      },
      body,
    })
  )
}

const waitFor = async (predicate: () => boolean, timeoutMs = 5000) => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const webhooksCli = (action: string, ...extra: string[]) =>
  execFileSync(
    process.execPath,
    [
      pikkuBin,
      'webhooks',
      action,
      '--url',
      'https://shop.test/api',
      '--labelPrefix',
      'shop:main',
      ...extra,
    ],
    { cwd: root, env: variables.getAll(), encoding: 'utf-8' }
  )
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))

before(async () => {
  const config = await createConfig()
  const singletonServices = await createSingletonServices(config)
  pikkuState(null, 'package', 'singletonServices', singletonServices)
})

after(async () => {
  await content.deleteByPrefix('credentials', '')
  await content.deleteByPrefix('provider', '')
  await content.deleteByPrefix('previous', '')
})

beforeEach(() => {
  firedOrders.length = 0
})

describe('webhook source: route → queue → trigger', () => {
  test('a signed event reaches its trigger through the queue', async () => {
    const response = await post({
      type: 'order.paid',
      id: 'evt_1',
      data: { orderId: 'o1', total: 42 },
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { received: 1 })
    await waitFor(() => firedOrders.length === 1)
    assert.deepEqual(firedOrders, [{ orderId: 'o1', total: 42 }])
  })

  test('a bad signature is rejected and nothing is queued', async () => {
    const response = await post(
      { type: 'order.paid', id: 'evt_2', data: { orderId: 'o2', total: 1 } },
      'forged'
    )

    assert.equal(response.status, 401)
    await new Promise((resolve) => setTimeout(resolve, 400))
    assert.deepEqual(firedOrders, [])
  })

  test('a handshake is answered directly', async () => {
    const response = await post({ type: 'url_verification', challenge: 'c1' })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { challenge: 'c1' })
  })

  test('an event no trigger listens for is acknowledged and dropped', async () => {
    const response = await post({
      type: 'order.refunded',
      id: 'evt_3',
      data: { orderId: 'o3' },
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { received: 0 })
  })

  test('an event that fails its schema is dropped', async () => {
    const response = await post({
      type: 'order.paid',
      id: 'evt_4',
      data: { orderId: 'o4', total: 'lots' },
    })

    assert.deepEqual(await response.json(), { received: 0 })
  })

  test('a failing trigger is retried by the queue', async () => {
    failNextOrders.add('o5')
    await post({
      type: 'order.paid',
      id: 'evt_5',
      data: { orderId: 'o5', total: 5 },
    })

    await waitFor(() => firedOrders.length === 1)
    assert.deepEqual(firedOrders, [{ orderId: 'o5', total: 5 }])
  })
})

describe('pikku webhooks: provider lifecycle', () => {
  test('status reports missing before setup', async () => {
    await writeEndpoints([])
    assert.deepEqual(webhooksCli('status'), [
      {
        source: 'shop',
        url: 'https://shop.test/api/webhooks/shop',
        status: 'missing',
      },
    ])
  })

  test('setup registers the route and stores the secret, never printing it', async () => {
    const [outcome] = webhooksCli('setup')

    assert.deepEqual(outcome, {
      source: 'shop',
      url: 'https://shop.test/api/webhooks/shop',
      status: 'created',
      state: { id: 'we_1' },
    })
    assert.equal(
      (await storedCredentials()).shopWebhookSecret,
      'whsec_shop:main:shop'
    )
    assert.deepEqual(await readEndpoints(), [
      {
        id: 'we_1',
        url: 'https://shop.test/api/webhooks/shop',
        label: 'shop:main:shop',
        events: ['order.paid'],
        secret: 'whsec_shop:main:shop',
      },
    ])
  })

  test('the secret setup stored verifies the next delivery, with no restart', async () => {
    const body = JSON.stringify({
      type: 'order.paid',
      id: 'evt_6',
      data: { orderId: 'o6', total: 6 },
    })
    const response = await post(
      JSON.parse(body),
      sign(body, 'whsec_shop:main:shop')
    )

    assert.equal(response.status, 200)
    await waitFor(() => firedOrders.length === 1)
  })

  test('a second setup is a no-op', async () => {
    assert.equal(webhooksCli('setup')[0].status, 'unchanged')
    assert.equal((await readEndpoints()).length, 1)
  })

  test('setup repairs drift', async () => {
    const [endpoint] = await readEndpoints()
    await writeEndpoints([
      { ...endpoint!, url: 'https://old.test/webhooks/shop' },
    ])

    assert.equal(webhooksCli('status')[0].status, 'drifted')
    assert.equal(webhooksCli('setup')[0].status, 'updated')
    assert.equal(
      (await readEndpoints())[0]!.url,
      'https://shop.test/api/webhooks/shop'
    )
  })

  test('teardown removes the endpoint, then finds nothing', async () => {
    const previous = join(scratch, 'private/previous/previous.json')
    await putText(
      content,
      'previous',
      'previous.json',
      JSON.stringify({ shop: { id: 'we_1' } })
    )

    assert.equal(
      webhooksCli('teardown', '--previous', previous)[0].status,
      'deleted'
    )
    assert.deepEqual(await readEndpoints(), [])
    assert.equal((await storedCredentials()).shopWebhookSecret, undefined)
    assert.equal(webhooksCli('teardown')[0].status, 'absent')
  })

  test('a missing --labelPrefix is refused before any provider call', async () => {
    await writeEndpoints([])
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [pikkuBin, 'webhooks', 'setup', '--url', 'https://shop.test/api'],
        { cwd: root, env: variables.getAll(), stdio: 'pipe' }
      )
    )
    assert.deepEqual(await readEndpoints(), [])
  })
})
