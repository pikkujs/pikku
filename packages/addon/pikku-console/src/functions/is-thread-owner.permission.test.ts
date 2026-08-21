import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isThreadOwner } from './is-thread-owner.permission.js'

const services = {
  agentRunService: {
    getThread: async (threadId: string) =>
      threadId === 'thread-1' ? { threadId, resourceId: 'alice' } : null,
  },
} as never

const check = (session: unknown, threadId = 'thread-1') =>
  isThreadOwner(services, { threadId }, { session } as never)

test('the owning session is allowed', async () => {
  assert.equal(await check({ userId: 'alice', scopes: [] }), true)
})

test("someone else's thread is refused", async () => {
  assert.equal(await check({ userId: 'carol', scopes: [] }), false)
})

test('an admin reaches any thread', async () => {
  assert.equal(await check({ userId: 'root', scopes: ['admin'] }), true)
})

test('a missing thread reads the same as one owned by someone else', async () => {
  assert.equal(await check({ userId: 'alice', scopes: [] }, 'nope'), false)
})

test('a session with no principals is refused', async () => {
  assert.equal(await check({ scopes: [] }), false)
})
