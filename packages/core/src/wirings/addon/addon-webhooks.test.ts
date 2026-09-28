import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { getOrCreatePackageSingletonServices } from './addon-runner.js'
import type {
  SendWebhookInput,
  WebhookService,
} from '../../services/webhook-service.js'
import type { CoreSingletonServices } from '../../types/core.types.js'

const ADDON_PACKAGE = '@addon/example'

const createParent = (sent: SendWebhookInput[]) =>
  ({
    config: {},
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    webhookService: {
      send: async (input: SendWebhookInput) => {
        sent.push(input)
        return { jobId: 'j' }
      },
    } as unknown as WebhookService,
  }) as unknown as CoreSingletonServices

describe('addon webhookService', () => {
  beforeEach(() => resetPikkuState())

  test('prefixes events with the instance name without a factory', async () => {
    const sent: SendWebhookInput[] = []
    const services = await getOrCreatePackageSingletonServices(
      ADDON_PACKAGE,
      createParent(sent),
      { namespace: 'stripe-eu' }
    )
    await services.webhookService!.send({
      url: 'https://x',
      event: 'order.paid',
      data: {},
    })
    assert.equal(sent[0]?.event, 'stripe-eu:order.paid')
  })

  test('prefixes once when the factory passes the parent service through', async () => {
    pikkuState(ADDON_PACKAGE, 'package', 'factories', {
      createSingletonServices: (async (_config: unknown, parent: any) => ({
        ...parent,
      })) as never,
    })
    const sent: SendWebhookInput[] = []
    const services = await getOrCreatePackageSingletonServices(
      ADDON_PACKAGE,
      createParent(sent),
      { namespace: 'stripe-us' }
    )
    await services.webhookService!.send({
      url: 'https://x',
      event: 'order.paid',
      data: {},
    })
    await services.webhookService!.send({ url: 'https://x', data: {} })
    assert.deepEqual(
      sent.map((s) => s.event),
      ['stripe-us:order.paid', undefined]
    )
  })
})
