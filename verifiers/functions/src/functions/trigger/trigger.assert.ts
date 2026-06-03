import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import '../../../.pikku/pikku-bootstrap.gen.js'
import { InMemoryTriggerService } from '@pikku/core/services'
import { createConfig, createSingletonServices } from '../../services.js'
import { clearInvokers, getInvoker } from './trigger.functions.js'
import { clearInvocations, getInvocations } from './trigger-target.functions.js'

let triggerService: InMemoryTriggerService | null = null

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number = 1000
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for trigger delivery')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

beforeEach(async () => {
  clearInvokers()
  clearInvocations()

  const config = await createConfig()
  await createSingletonServices(config)

  triggerService = new InMemoryTriggerService()
  await triggerService.start()
})

afterEach(async () => {
  await triggerService?.stop()
  triggerService = null
  clearInvokers()
  clearInvocations()
})

describe('trigger verifier', () => {
  test('fires a named trigger into its target function and tears down cleanly', async () => {
    const invoke = getInvoker('test-event')
    assert.equal(typeof invoke, 'function')

    await invoke?.({ payload: 'hello trigger' })
    await waitFor(() => getInvocations().length === 1)

    const invocations = getInvocations()
    assert.equal(invocations.length, 1)
    assert.deepEqual(invocations[0], {
      data: { payload: 'hello trigger' },
    })

    await triggerService?.stop()
    triggerService = null

    assert.equal(getInvoker('test-event'), undefined)
  })
})
