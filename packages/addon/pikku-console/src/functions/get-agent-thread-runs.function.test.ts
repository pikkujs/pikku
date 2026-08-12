import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getAgentThreadRuns } from './get-agent-thread-runs.function.js'

const RUNS = [
  { runId: 'run-1', resourceId: 'alice' },
  { runId: 'run-2', resourceId: 'bob' },
]

const services = {
  agentRunService: { getThreadRuns: async () => RUNS },
} as never

const read = (session: unknown) =>
  getAgentThreadRuns.func(
    services,
    { threadId: 'thread-1' } as never,
    {
      session,
    } as never
  )

test('a caller sees only the runs their own session owns', async () => {
  assert.deepEqual(await read({ userId: 'alice', scopes: [] }), [RUNS[0]])
})

test('an admin sees every run on the thread', async () => {
  assert.deepEqual(await read({ userId: 'root', scopes: ['admin'] }), RUNS)
})

test("someone else's thread reads the same as an empty one", async () => {
  // Filtered, not refused: a refusal would confirm the thread exists.
  assert.deepEqual(await read({ userId: 'carol', scopes: [] }), [])
})

test('a session with no principals sees nothing', async () => {
  assert.deepEqual(await read({ scopes: [] }), [])
})
