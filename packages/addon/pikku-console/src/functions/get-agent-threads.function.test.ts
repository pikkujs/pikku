import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getAgentThreads } from './get-agent-threads.function.js'

const recordingAgentRunService = () => {
  const calls: any[] = []
  return {
    calls,
    services: {
      agentRunService: {
        listThreads: async (options: any) => {
          calls.push(options)
          return []
        },
      },
    } as never,
  }
}

test('a non-admin session lists only the threads its principals own', async () => {
  const { calls, services } = recordingAgentRunService()
  await getAgentThreads.func(
    services,
    {} as never,
    {
      session: {
        userId: 'alice',
        orgId: 'org-x',
        scopes: ['pikku:console:wirings:read'],
      },
    } as never
  )
  assert.deepEqual(calls[0].owners, ['alice', 'org-x'])
})

test('a session carrying no principals matches nothing rather than everything', async () => {
  const { calls, services } = recordingAgentRunService()
  await getAgentThreads.func(
    services,
    {} as never,
    {
      session: { scopes: [] },
    } as never
  )
  assert.deepEqual(calls[0].owners, [])
})

test('an admin session lists every thread', async () => {
  const { calls, services } = recordingAgentRunService()
  await getAgentThreads.func(
    services,
    {} as never,
    {
      session: { userId: 'root', scopes: ['admin'] },
    } as never
  )
  assert.equal(calls[0].owners, undefined)
})

test('an admin grant nested under the umbrella still lists every thread', async () => {
  const { calls, services } = recordingAgentRunService()
  await getAgentThreads.func(
    services,
    {} as never,
    {
      session: { userId: 'root', scopes: ['admin:*'] },
    } as never
  )
  assert.equal(calls[0].owners, undefined)
})

test('input filters cannot widen the owners constraint', async () => {
  const { calls, services } = recordingAgentRunService()
  await getAgentThreads.func(
    services,
    {
      agentName: 'support',
      resourceId: 'mallory',
      owners: ['mallory'],
    } as never,
    { session: { userId: 'alice', scopes: [] } } as never
  )
  assert.deepEqual(calls[0].owners, ['alice'])
  assert.equal(calls[0].resourceId, 'mallory')
})
