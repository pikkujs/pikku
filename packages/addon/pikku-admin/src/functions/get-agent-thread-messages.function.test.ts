import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getAgentThreadMessages } from './get-agent-thread-messages.function.js'
import { isThreadOwner } from './is-thread-owner.permission.js'

test('thread messages are gated on thread ownership', () => {
  assert.deepEqual(getAgentThreadMessages.permissions, { owner: isThreadOwner })
})
