import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { pikkuState, resetPikkuState } from '@pikku/core/state'

import { getQueueHistory } from './get-queue-history.function.js'

beforeEach(() => {
  resetPikkuState()
  pikkuState(null, 'queue', 'meta', {
    emails: { pikkuFuncId: 'queue_emails', name: 'emails' },
    reports: { pikkuFuncId: 'queue_reports', name: 'reports' },
  } as any)
})

const inspecting = () => {
  const asked: Array<[string, unknown]> = []
  return {
    asked,
    queueService: {
      inspect: async (queueName: string, opts: unknown) => {
        asked.push([queueName, opts])
        return { counts: {}, recent: [] }
      },
    },
  }
}

test('an app with no queue service has no history rather than throwing', async () => {
  assert.deepEqual(
    await getQueueHistory.func(
      { queueService: undefined } as never,
      {} as never,
      {} as never
    ),
    {}
  )
})

test('a queue service that cannot inspect its backlog has no history', async () => {
  assert.deepEqual(
    await getQueueHistory.func(
      { queueService: { add: async () => 'id' } } as never,
      {} as never,
      {} as never
    ),
    {}
  )
})

test('every wired queue is inspected with the requested limit', async () => {
  const { asked, queueService } = inspecting()
  const history = await getQueueHistory.func(
    { queueService } as never,
    { limit: 5 } as never,
    {} as never
  )
  assert.deepEqual(Object.keys(history!), ['emails', 'reports'])
  assert.deepEqual(asked, [
    ['emails', { limit: 5 }],
    ['reports', { limit: 5 }],
  ])
})

test('queueNames narrows the queues inspected', async () => {
  const { asked, queueService } = inspecting()
  await getQueueHistory.func(
    { queueService } as never,
    { queueNames: ['reports'] } as never,
    {} as never
  )
  assert.deepEqual(asked, [['reports', { limit: undefined }]])
})
