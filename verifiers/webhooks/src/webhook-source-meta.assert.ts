import assert from 'node:assert/strict'
import { test } from 'node:test'
import '../.pikku/pikku-bootstrap.gen.js'
import { pikkuState } from '@pikku/core/state'

test('the generated metadata records how the shop source verifies and where its secret lives', () => {
  const shop = pikkuState(null, 'trigger', 'webhookSourceMeta').shop
  assert.deepEqual(shop?.verify, {
    kind: 'hmac',
    header: 'x-shop-signature',
    algorithm: 'sha256',
  })
  assert.equal(shop?.credential, 'shopWebhookSecret')
})
