import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  serializeWebhookSourceWirings,
  serializeWebhookSourcesLifecycle,
} from './serialize-webhook-sources.js'

const leaf = (name: string) => `../${name}/index.js`

describe('serializeWebhookSourceWirings', () => {
  const content = serializeWebhookSourceWirings(
    {
      stripe: {
        name: 'stripe',
        method: 'post',
        route: '/webhooks/stripe',
        events: ['checkout.session.completed'],
        receive: 'stripe-eu:receiveStripeWebhook',
      },
      github: {
        name: 'github',
        method: 'post',
        route: '/hooks/github',
        events: [],
      },
    },
    leaf,
    './pikku-webhook-sources.schemas.gen.js'
  )

  test('mounts an open route per source that receives and queues', () => {
    assert.match(content, /route: "\/webhooks\/stripe",\n  auth: false,/)
    assert.match(content, /receiveWebhookSourceRequest\("stripe", wire\)/)
    assert.match(content, /route: "\/hooks\/github"/)
    assert.ok(
      content.indexOf('"/hooks/github"') < content.indexOf('"/webhooks/stripe"')
    )
  })

  test('mounts a route per method for a source verified by GET', () => {
    const whatsapp = serializeWebhookSourceWirings(
      {
        whatsapp: {
          name: 'whatsapp',
          method: ['get', 'post'],
          route: '/webhooks/whatsapp',
          events: [],
        },
      },
      leaf,
      './pikku-webhook-sources.schemas.gen.js'
    )
    assert.match(whatsapp, /method: "get",\n  route: "\/webhooks\/whatsapp"/)
    assert.match(whatsapp, /method: "post",\n  route: "\/webhooks\/whatsapp"/)
  })

  test('wires one worker on the incoming queue', () => {
    assert.equal(content.match(/wireQueueWorker\(\{/g)?.length, 1)
    assert.match(content, /name: 'pikku-incoming-webhooks'/)
    assert.match(content, /dispatchWebhookSourceJob\(data\)/)
    assert.match(content, /input: WebhookSourceJob,/)
    assert.match(content, /from '\.\/pikku-webhook-sources\.schemas\.gen\.js'/)
    assert.match(content, /from '\.\.\/http\/index\.js'/)
    assert.match(content, /from '\.\.\/queue\/index\.js'/)
  })
})

describe('serializeWebhookSourcesLifecycle', () => {
  test("builds the app's services before running the lifecycle", () => {
    const content = serializeWebhookSourcesLifecycle({
      bootstrapPath: '../pikku-bootstrap.gen.js',
      pikkuConfigFactory: {
        path: '../../src/config.js',
        variable: 'makeConfig',
      },
      singletonServicesFactory: {
        path: '../../src/services.js',
        variable: 'makeServices',
      },
    })
    assert.match(
      content,
      /import \{ makeConfig as createConfig \} from '\.\.\/\.\.\/src\/config\.js'/
    )
    assert.match(
      content,
      /import \{ makeServices as createSingletonServices \} from '\.\.\/\.\.\/src\/services\.js'/
    )
    assert.match(content, /import '\.\.\/pikku-bootstrap\.gen\.js'/)
    assert.match(
      content,
      /runWebhookSourceLifecycle\(\{ \.\.\.args, singletonServices \}\)/
    )
  })

  test('runs without a config factory', () => {
    const content = serializeWebhookSourcesLifecycle({
      bootstrapPath: './b.js',
      singletonServicesFactory: { path: './s.js', variable: 's' },
    })
    assert.doesNotMatch(content, /createConfig/)
    assert.match(content, /const config = \{\}/)
  })
})
