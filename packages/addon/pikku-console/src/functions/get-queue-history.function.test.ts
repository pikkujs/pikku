import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getQueueHistory } from './get-queue-history.function.js'

const metaService = {
  getQueueMeta: async () => ({ emails: {}, reports: {} }),
}

test('an app with no queue service has no history rather than throwing', async () => {
  assert.deepEqual(
    await getQueueHistory.func(
      { queueService: undefined, metaService } as never,
      {} as never,
      {} as never
    ),
    {}
  )
})

test('a queue service that cannot inspect its backlog has no history', async () => {
  assert.deepEqual(
    await getQueueHistory.func(
      { queueService: { add: async () => 'id' }, metaService } as never,
      {} as never,
      {} as never
    ),
    {}
  )
})

test('every queue worker is inspected with the requested limit', async () => {
  const asked: Array<[string, unknown]> = []
  const queueService = {
    inspect: async (queueName: string, opts: unknown) => {
      asked.push([queueName, opts])
      return { counts: { waiting: queueName.length }, recent: [] }
    },
  }
  const history = await getQueueHistory.func(
    { queueService, metaService } as never,
    { limit: 5 } as never,
    {} as never
  )
  assert.deepEqual(Object.keys(history!), ['emails', 'reports'])
  assert.deepEqual(asked, [
    ['emails', { limit: 5 }],
    ['reports', { limit: 5 }],
  ])
})
