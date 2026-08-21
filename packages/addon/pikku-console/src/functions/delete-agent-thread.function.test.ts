import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deleteAgentThread } from './delete-agent-thread.function.js'
import { isThreadOwner } from './is-thread-owner.permission.js'

test('deleting a thread is gated on thread ownership', () => {
  assert.deepEqual(deleteAgentThread.permissions, { owner: isThreadOwner })
})
