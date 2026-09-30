import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, describe, test } from 'node:test'

const scratch = mkdtempSync(join(tmpdir(), 'pikku-webhook-switch-'))
process.env.FAKE_PROVIDER_FILE = join(scratch, 'provider.json')
process.env.CREDENTIALS_FILE = join(scratch, 'credentials.json')
writeFileSync(process.env.CREDENTIALS_FILE, '{}')

import '../.pikku/pikku-bootstrap.gen.js'
import { fetch } from '@pikku/core/http'
import { InMemoryTriggerSourceStore } from '@pikku/core/services'
import { pikkuState } from '@pikku/core/state'
import {
  disableTriggerSource,
  enableTriggerSource,
  reconcileTriggerSources,
} from '@pikku/core/trigger'
import { createConfig, createSingletonServices } from './services.js'
import { firedOrders } from './shop.webhook-source.js'
import { readEndpoints, writeEndpoints } from './fake-provider.js'

const address = { baseUrl: 'https://shop.test/api', labelPrefix: 'shop:main' }
const secret = 'whsec_shop:main:shop'

const post = async () => {
  const body = JSON.stringify({
    type: 'order.paid',
    id: `evt_${Date.now()}`,
    data: { orderId: 'o1', total: 1 },
  })
  return fetch(
    new Request('http://localhost/webhooks/shop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shop-signature': createHmac('sha256', secret)
          .update(body)
          .digest('hex'),
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

before(async () => {
  const singletonServices = {
    ...(await createSingletonServices(await createConfig())),
    triggerSourceStore: new InMemoryTriggerSourceStore(),
  }
  pikkuState(null, 'package', 'singletonServices', singletonServices)
  writeEndpoints([])
})

after(() => rmSync(scratch, { recursive: true, force: true }))

beforeEach(() => {
  firedOrders.length = 0
})

describe('webhook source: off until turned on', () => {
  test('a source nobody turned on answers 404 and queues nothing', async () => {
    const response = await post()

    assert.equal(response.status, 404)
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.deepEqual(firedOrders, [])
  })

  test('reconcile skips it without calling the provider', async () => {
    assert.deepEqual(await reconcileTriggerSources(address), [
      {
        source: 'shop',
        url: 'https://shop.test/api/webhooks/shop',
        status: 'skipped',
        reason: 'disabled',
      },
    ])
    assert.deepEqual(readEndpoints(), [])
  })

  test('turning it on registers it at the address reconcile recorded', async () => {
    const outcome = await enableTriggerSource({ name: 'shop' })

    assert.equal(outcome.status, 'created')
    assert.deepEqual(
      readEndpoints().map(({ url, label }) => ({ url, label })),
      [{ url: 'https://shop.test/api/webhooks/shop', label: 'shop:main:shop' }]
    )
  })

  test('once on, a signed event reaches its trigger', async () => {
    const response = await post()

    assert.equal(response.status, 200)
    await waitFor(() => firedOrders.length === 1)
  })

  test('reconcile leaves a registered source alone', async () => {
    const [outcome] = await reconcileTriggerSources(address)

    assert.equal(outcome!.status, 'unchanged')
    assert.equal(readEndpoints().length, 1)
  })

  test('turning it off tears the endpoint down and answers 404 again', async () => {
    const outcome = await disableTriggerSource({ name: 'shop' })

    assert.equal(outcome.status, 'deleted')
    assert.deepEqual(readEndpoints(), [])
    assert.equal((await post()).status, 404)
  })
})
