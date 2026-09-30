import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  stepDispatchTarget,
  stepWorkerQueueName,
} from './workflow-queue-routing.js'

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
    queueService: {},
  } as any)
})

describe('compensation routes like its forward step', () => {
  test('the compensation runs on the forward function queue', () => {
    assert.equal(
      stepWorkerQueueName('per-workflow', 'chargeCard:compensate'),
      stepWorkerQueueName('per-workflow', 'chargeCard')
    )
  })

  test('a queued function has its compensation queued too', async () => {
    pikkuState(null, 'rpc', 'meta')['chargeCard'] = 'chargeCard'
    pikkuState(null, 'function', 'meta')['chargeCard'] = {
      name: 'chargeCard',
      pikkuFuncId: 'chargeCard',
      workflowQueued: true,
    } as any
    assert.equal(
      await stepDispatchTarget(
        'chargeCard:compensate',
        'Charge:compensate',
        async () => false
      ),
      'queue'
    )
  })

  test('an unmarked function has its compensation run inline', async () => {
    pikkuState(null, 'rpc', 'meta')['plain'] = 'plain'
    pikkuState(null, 'function', 'meta')['plain'] = {
      name: 'plain',
      pikkuFuncId: 'plain',
    } as any
    assert.equal(
      await stepDispatchTarget(
        'plain:compensate',
        'Plain:compensate',
        async () => false
      ),
      'inline'
    )
  })
})
