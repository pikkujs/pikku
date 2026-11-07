import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getAgentRunScores } from './get-agent-run-scores.function.js'

const SCORES = [{ runId: 'run-1', scorerName: 'brevity', score: 1 }]

const services = (resourceId: string | null) =>
  ({
    agentRunState: {
      getRun: async () => (resourceId === null ? null : { resourceId }),
      getScores: async () => SCORES,
    },
  }) as never

const read = (resourceId: string | null, session: unknown) =>
  getAgentRunScores.func(
    services(resourceId),
    { runId: 'run-1' } as never,
    {
      session,
    } as never
  )

test('the owner of the run reads its grades', async () => {
  assert.deepEqual(await read('alice', { userId: 'alice', scopes: [] }), SCORES)
})

test('a run belonging to someone else is absent, not forbidden', async () => {
  // Reported as missing rather than refused: a refusal would confirm the id
  // exists, which is most of what an enumeration needs.
  await assert.rejects(
    () => read('bob', { userId: 'alice', scopes: [] }),
    /No agent run 'run-1'/
  )
})

test('a sub-partition of the caller principal still belongs to them', async () => {
  assert.deepEqual(
    await read('alice:thread-7', { userId: 'alice', scopes: [] }),
    SCORES
  )
})

test('an admin reads any run', async () => {
  assert.deepEqual(
    await read('bob', { userId: 'root', scopes: ['admin'] }),
    SCORES
  )
})

test('a session with no principals reads nothing', async () => {
  await assert.rejects(() => read('alice', { scopes: [] }), /No agent run/)
})

test('a run that does not exist reads the same as one that is not yours', async () => {
  await assert.rejects(
    () => read(null, { userId: 'root', scopes: ['admin'] }),
    /No agent run 'run-1'/
  )
})
