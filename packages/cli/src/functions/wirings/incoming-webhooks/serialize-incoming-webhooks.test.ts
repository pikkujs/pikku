import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import type { IncomingWebhooksMeta } from '@pikku/core/webhook'
import {
  serializeIncomingWebhookDefinitions,
  serializeIncomingWebhookWiring,
} from './serialize-incoming-webhooks.js'

const meta: IncomingWebhooksMeta = {
  payments: {
    id: 'payments',
    localId: 'payments',
    pikkuFuncId: 'handlePayment',
    route: '/webhooks/payments',
    events: [],
    needs: {},
    exportedName: 'payments',
    sourceFile: '/app/src/webhooks.ts',
  },
  'stripe-eu:checkout': {
    id: 'stripe-eu:checkout',
    localId: 'checkout',
    instance: 'stripe-eu',
    package: '@pikku/addon-commerce-stripe',
    pikkuFuncId: 'stripe-eu:handleStripeWebhook',
    route: '/webhooks/stripe-eu/checkout',
    events: [],
    needs: {},
    exportedName: 'checkout',
  },
}

describe('serializeIncomingWebhookDefinitions', () => {
  test('maps scoped ids to the app and addon declarations', () => {
    const content = serializeIncomingWebhookDefinitions({
      meta,
      incomingWebhooksFile:
        '/app/.pikku/webhooks/pikku-incoming-webhooks.gen.ts',
      packageMappings: {},
    })

    assert.match(
      content,
      /import \{ payments as webhook0 \} from '\.\.\/\.\.\/src\/webhooks\.js'/
    )
    assert.match(
      content,
      /import \{ incomingWebhooks as addon0 \} from '@pikku\/addon-commerce-stripe\/\.pikku\/webhooks\/pikku-incoming-webhooks\.gen\.js'/
    )
    assert.match(content, /"payments": webhook0,/)
    assert.match(content, /"stripe-eu:checkout": addon0\["checkout"\],/)
  })
})

describe('serializeIncomingWebhookWiring', () => {
  test("wires the app's func and leaves an addon's to its instance", () => {
    const content = serializeIncomingWebhookWiring({
      meta,
      incomingWebhooksWiringFile:
        '/app/.pikku/webhooks/pikku-incoming-webhooks-wiring.gen.ts',
      packageMappings: {},
    })

    assert.match(
      content,
      /wireHTTP\(\{ method: 'post', route: "\/webhooks\/payments", auth: false, func: webhook0\.func \}\)/
    )
    assert.match(
      content,
      /wireHTTP\(\{ method: 'post', route: "\/webhooks\/stripe-eu\/checkout", auth: false \} as WireHTTPInput\)/
    )
  })
})
