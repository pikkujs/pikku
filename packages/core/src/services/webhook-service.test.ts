import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  WebhookService,
  type SendWebhookInput,
  type SendWebhookResult,
} from './webhook-service.js'
import { NotImplementedError } from '../errors/errors.js'
import type { Safe } from '../types/core.types.js'

/**
 * The smallest thing that satisfies the abstract class: a service that can
 * send and has opted into nothing else. What it inherits is what an app with
 * no delivery store gets.
 */
class SendOnlyWebhookService extends WebhookService {
  public async send<T extends SendWebhookInput>(
    _input: Safe<T>
  ): Promise<SendWebhookResult> {
    return { jobId: 'job-1' }
  }
}

describe('WebhookService without persistence', () => {
  const service = new SendOnlyWebhookService()

  test('reads a history nobody keeps as empty, not as an error', async () => {
    assert.deepEqual(await service.listDeliveries(), [])
    assert.deepEqual(await service.listDeliveries({ limit: 10 }), [])
    assert.equal(await service.getDelivery('delivery-1'), null)
  })

  test('a write that would go nowhere still throws', () => {
    assert.throws(
      () =>
        service.recordAttempt('delivery-1', {
          delivered: true,
          statusCode: 200,
        }),
      NotImplementedError
    )
  })
})
