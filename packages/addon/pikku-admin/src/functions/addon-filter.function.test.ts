import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { getAgentThreads } from './get-agent-threads.function.js'
import { getWorkflowRunNames } from './get-workflow-run-names.function.js'
import { getWorkflowRuns } from './get-workflow-runs.function.js'

const run = (
  fn: { func: (...args: any[]) => unknown },
  ...args: unknown[]
): Promise<any> => fn.func(...args) as Promise<any>

const wire = {} as never
const admin = { session: { scopes: ['admin'] } } as never

const runs = [
  { id: '1', workflow: 'spindle:extract', createdAt: '2026-01-01' },
  { id: '2', workflow: 'spindle:extract', createdAt: '2026-01-03' },
  { id: '3', workflow: 'spindle2:extract', createdAt: '2026-01-04' },
  { id: '4', workflow: 'plain', createdAt: '2026-01-05' },
]

const workflowServices = () => {
  const calls: any[] = []
  return {
    calls,
    services: {
      workflowRunService: {
        getDistinctWorkflowNames: async () => [
          'spindle:extract',
          'spindle2:extract',
          'plain',
        ],
        listRuns: async (options: any) => {
          calls.push(options)
          return runs.filter(
            (run) =>
              !options?.workflowName || run.workflow === options.workflowName
          )
        },
      },
    } as never,
  }
}

describe('getWorkflowRunNames', () => {
  const { services } = workflowServices()

  test('without an addon returns every name', async () => {
    assert.equal(
      (await run(getWorkflowRunNames, services, null, wire)).length,
      3
    )
  })

  test('an addon returns its own, never a look-alike or the project', async () => {
    assert.deepEqual(
      await run(getWorkflowRunNames, services, { addon: 'spindle' }, wire),
      ['spindle:extract']
    )
    assert.deepEqual(
      await run(getWorkflowRunNames, services, { addon: 'ghost' }, wire),
      []
    )
  })
})

describe('getWorkflowRuns', () => {
  test('without an addon passes the original options straight through', async () => {
    const { calls, services } = workflowServices()
    const result = await run(
      getWorkflowRuns,
      services,
      { workflowName: 'plain', status: 'done', limit: 5, offset: 1 },
      wire
    )
    assert.deepEqual(calls, [
      { workflowName: 'plain', status: 'done', limit: 5, offset: 1 },
    ])
    assert.equal(result.length, 1)
  })

  test('an addon returns only its workflows newest first', async () => {
    const { services } = workflowServices()
    const result = await run(
      getWorkflowRuns,
      services,
      { addon: 'spindle' },
      wire
    )
    assert.deepEqual(
      result.map((r: any) => r.id),
      ['2', '1']
    )
  })

  test('paging applies after the addon filter', async () => {
    const { services } = workflowServices()
    const result = await run(
      getWorkflowRuns,
      services,
      { addon: 'spindle', limit: 1, offset: 1 },
      wire
    )
    assert.deepEqual(
      result.map((r: any) => r.id),
      ['1']
    )
  })

  test('an unknown addon returns empty and asks the service for nothing', async () => {
    const { calls, services } = workflowServices()
    assert.deepEqual(
      await run(getWorkflowRuns, services, { addon: 'ghost' }, wire),
      []
    )
    assert.deepEqual(calls, [])
  })

  test('an explicit workflow name outside the addon returns nothing', async () => {
    const { services } = workflowServices()
    assert.deepEqual(
      await run(
        getWorkflowRuns,
        services,
        { addon: 'spindle', workflowName: 'plain' },
        wire
      ),
      []
    )
  })
})

const threadsByAgent: Record<string, any[]> = {
  'spindle:helper': [
    { id: 't1', updatedAt: '2026-01-01' },
    { id: 't2', updatedAt: '2026-01-03' },
  ],
  'spindle2:helper': [{ id: 't3', updatedAt: '2026-01-04' }],
  plain: [{ id: 't4', updatedAt: '2026-01-05' }],
}

const agentServices = () => {
  const calls: any[] = []
  return {
    calls,
    services: {
      agentRunService: {
        getDistinctAgentNames: async () => Object.keys(threadsByAgent),
        listThreads: async (options: any) => {
          calls.push(options)
          return options.agentName
            ? threadsByAgent[options.agentName]
            : Object.values(threadsByAgent).flat()
        },
      },
    } as never,
  }
}

describe('getAgentThreads', () => {
  test('without an addon lists as before', async () => {
    const { calls, services } = agentServices()
    const result = await run(getAgentThreads, services, {}, admin)
    assert.equal(result.length, 4)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].agentName, undefined)
  })

  test('an addon lists only its agents threads newest first', async () => {
    const { services } = agentServices()
    const result = await run(
      getAgentThreads,
      services,
      { addon: 'spindle' },
      admin
    )
    assert.deepEqual(
      result.map((t: any) => t.id),
      ['t2', 't1']
    )
  })

  test('paging applies after the addon filter', async () => {
    const { services } = agentServices()
    const result = await run(
      getAgentThreads,
      services,
      { addon: 'spindle', limit: 1 },
      admin
    )
    assert.deepEqual(
      result.map((t: any) => t.id),
      ['t2']
    )
  })

  test('an unknown addon returns empty and a look-alike is not matched', async () => {
    const { calls, services } = agentServices()
    assert.deepEqual(
      await run(getAgentThreads, services, { addon: 'ghost' }, admin),
      []
    )
    assert.deepEqual(calls, [])
    const lookalike = await run(
      getAgentThreads,
      services,
      { addon: 'spindle2' },
      admin
    )
    assert.deepEqual(
      lookalike.map((t: any) => t.id),
      ['t3']
    )
  })

  test('the owner constraint still applies when an addon is chosen', async () => {
    const { calls, services } = agentServices()
    await run(getAgentThreads, services, { addon: 'spindle' }, {
      session: { userId: 'alice', scopes: [] },
    } as never)
    assert.deepEqual(calls[0].owners, ['alice'])
  })
})
