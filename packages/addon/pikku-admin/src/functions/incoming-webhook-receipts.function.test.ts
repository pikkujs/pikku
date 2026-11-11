import assert from 'node:assert/strict'
import { test } from 'node:test'

import { listIncomingWebhookReceipts } from './list-incoming-webhook-receipts.function.js'
import { getIncomingWebhookReceipt } from './get-incoming-webhook-receipt.function.js'

test('an app that wires no incoming webhook service lists nothing rather than throwing', async () => {
  const receipts = await listIncomingWebhookReceipts.func(
    { incomingWebhookService: undefined } as never,
    {} as never,
    {} as never
  )
  assert.deepEqual(receipts, [])
})

test('a receipt read against no incoming webhook service is a miss, not a crash', async () => {
  const receipt = await getIncomingWebhookReceipt.func(
    { incomingWebhookService: undefined } as never,
    { receiptId: 'whatever' } as never,
    {} as never
  )
  assert.equal(receipt, null)
})

test('a wired incoming webhook service is read through', async () => {
  const record = { receiptId: 'r1', source: 'shop' }
  let listedWith: unknown
  const services = {
    incomingWebhookService: {
      listReceipts: async (opts: unknown) => {
        listedWith = opts
        return [record]
      },
      getReceipt: async (receiptId: string) =>
        receiptId === 'r1' ? record : null,
    },
  } as never

  assert.deepEqual(
    await listIncomingWebhookReceipts.func(
      services,
      { source: 'shop', limit: 5 } as never,
      {} as never
    ),
    [record]
  )
  assert.deepEqual(listedWith, { source: 'shop', limit: 5 })
  assert.deepEqual(
    await getIncomingWebhookReceipt.func(
      services,
      { receiptId: 'r1' } as never,
      {} as never
    ),
    record
  )
  assert.equal(
    await getIncomingWebhookReceipt.func(
      services,
      { receiptId: 'r2' } as never,
      {} as never
    ),
    null
  )
})
