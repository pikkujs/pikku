import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState } from '../../pikku-state.js'
import { InMemoryWorkflowService } from '../workflow/in-memory-workflow-service.js'
import { QueuedWorkflowHarness } from '../../testing/service-tests/queued-workflow-harness.js'
import { pikkuAttentionFunc, attentionSchedule } from './attention-func.js'
import { addAttentionFunc } from './attention-func-registry.js'
import { runScheduledTask } from '../scheduler/scheduler-runner.js'
import {
  getAttention,
  refreshAttention,
  refreshWatchedAttention,
  attentionWorkflowName,
} from './attention-func-run.js'
import { InMemoryAttentionResultStore } from './attention-func-store.js'
import type { PikkuAttentionFunc } from './attention-func.types.js'

describe('pikkuAttentionFunc', () => {
  const body = async () => undefined

  test('keeps widget, every and func as declared', () => {
    const declared = pikkuAttentionFunc({
      widget: 'health.verdict',
      every: '1m',
      func: body,
    })
    assert.equal(declared.widget, 'health.verdict')
    assert.equal(declared.every, '1m')
    assert.equal(declared.func, body)
  })

  test('refuses a widget that is not <screen>.<slot>', () => {
    for (const widget of [
      'health',
      'health.',
      '.verdict',
      'a.b.c',
      'Health.v',
    ]) {
      assert.throws(
        () => pikkuAttentionFunc({ widget, every: '1m', func: body }),
        /not a '<screen>.<slot>' id/,
        widget
      )
    }
  })

  test('refuses an every that is not whole minutes, hours or days', () => {
    for (const every of ['30s', '1.5m', '0m', 'soon', '90m', '']) {
      assert.throws(
        () => pikkuAttentionFunc({ widget: 'a.b', every, func: body }),
        /every:/,
        every
      )
    }
  })

  test('turns every into the cron it refreshes on', () => {
    assert.equal(attentionSchedule('a.b', '1m'), '*/1 * * * *')
    assert.equal(attentionSchedule('a.b', '15m'), '*/15 * * * *')
    assert.equal(attentionSchedule('a.b', '2h'), '0 */2 * * *')
    assert.equal(attentionSchedule('a.b', '1d'), '0 0 */1 * *')
  })
})

describe('an attention func as a workflow', () => {
  let h: QueuedWorkflowHarness
  let store: InMemoryAttentionResultStore

  const services = () => pikkuState(null, 'package', 'singletonServices') as any

  const declare = (
    func: PikkuAttentionFunc['func'],
    widget = 'health.verdict'
  ) => {
    pikkuState(null, 'attention', 'meta')[widget] = {
      widget,
      every: '1m',
      schedule: '*/1 * * * *',
    }
    addAttentionFunc(widget, pikkuAttentionFunc({ widget, every: '1m', func }))
  }

  beforeEach(() => {
    h = new QueuedWorkflowHarness(new InMemoryWorkflowService())
    store = new InMemoryAttentionResultStore()
    services().attentionResults = store
    h.rpc.rpcWithWire = (async (name: string, data: any, wire: any) => {
      const funcs = pikkuState(null, 'function', 'functions')
      return funcs.get(name)!.func(services(), data, wire)
    }) as never
  })

  const refresh = (projectKey = 'p1', widget = 'health.verdict') =>
    refreshAttention(services(), { rpc: h.rpc } as never, {
      projectKey,
      widget,
    })

  test('a func that returns nothing stores a quiet result with the time', async () => {
    declare(async () => undefined)
    const before = Date.now()
    const result = await refresh()
    assert.equal(result?.status, 'quiet')
    assert.equal(result?.score, undefined)
    assert.ok(result!.updatedAt.getTime() >= before)
  })

  test('a score is stored whole, keyed by project and widget', async () => {
    declare(async (_s, data) => ({
      score: 0.8,
      verdict: { tone: 'bad' },
      reason: `broken in ${data.projectKey}`,
      impact: 3,
      since: '2026-11-24T10:00:00Z',
    }))
    await refresh('p1')
    const stored = await getAttention(services(), {
      projectKey: 'p1',
      widget: 'health.verdict',
    })
    assert.equal(stored?.status, 'attention')
    assert.deepEqual(stored?.score, {
      score: 0.8,
      verdict: { tone: 'bad' },
      reason: 'broken in p1',
      impact: 3,
      since: '2026-11-24T10:00:00Z',
    })
    assert.equal(
      await getAttention(services(), {
        projectKey: 'p2',
        widget: 'health.verdict',
      }),
      undefined,
      'another project has no result'
    )
  })

  test('the get step is retried and then succeeds', async () => {
    let calls = 0
    declare(async () => {
      calls++
      if (calls < 3) throw new Error('flaky')
      return { score: 0.4 }
    })
    const result = await refresh()
    assert.equal(calls, 3)
    assert.equal(result?.status, 'attention')
  })

  test('a get step that keeps failing stores "failed" instead of nothing', async () => {
    let calls = 0
    declare(async () => {
      calls++
      throw new Error('metrics are down')
    })
    const result = await refresh()
    assert.equal(calls > 1, true, 'it was retried')
    assert.equal(result?.status, 'failed')
    assert.match(result!.error!, /metrics are down/)
  })

  test('a score outside 0..1 is a failure, not a stored result', async () => {
    declare(async () => ({ score: 1.5 }))
    const result = await refresh()
    assert.equal(result?.status, 'failed')
    assert.match(result!.error!, /number from 0 to 1/)
  })

  test('the run shows its steps: a get step, then a store step', async () => {
    declare(async () => ({ score: 0.2 }))
    await refresh()
    const [runId] = [...(h.ws as any).runs.keys()]
    const names = (await h.steps(runId)).map((step) => step.stepName)
    assert.deepEqual(names, ['Check health.verdict', 'Store health.verdict'])
  })

  test('the schedule refreshes every project that asked, and no other', async () => {
    declare(async () => ({ score: 0.1 }))
    await refresh('p1')
    await refresh('p2')
    const started: string[] = []
    const countBefore = h.queue.length
    services().workflowService.startWorkflow = async (_n: string, d: any) => {
      started.push(d.projectKey)
      return { runId: 'x' }
    }
    const count = await refreshWatchedAttention(
      services(),
      { rpc: h.rpc } as never,
      'health.verdict'
    )
    assert.equal(countBefore, 0)
    assert.equal(count, 2)
    assert.deepEqual(started.sort(), ['p1', 'p2'])
  })

  test('the schedule is wired from every', () => {
    declare(async () => undefined)
    const task = pikkuState(null, 'scheduler', 'tasks').get(
      'attention.health.verdict.refresh'
    )
    assert.equal(task?.schedule, '*/1 * * * *')
  })

  test('the scheduled task runs through the scheduler and stores a result', async () => {
    declare(async (_s, data) => ({ score: 0.6, reason: data.projectKey }))
    await store.watch('p1', 'health.verdict')
    await runScheduledTask({ name: 'attention.health.verdict.refresh' })
    await h.pump()
    const stored = await getAttention(services(), {
      projectKey: 'p1',
      widget: 'health.verdict',
    })
    assert.equal(stored?.status, 'attention')
    assert.deepEqual(stored?.score, { score: 0.6, reason: 'p1' })
  })

  test('a widget with no registered func cannot be read or refreshed', async () => {
    await assert.rejects(
      getAttention(services(), { projectKey: 'p1', widget: 'nope.nope' }),
      /No attention func is registered/
    )
  })

  test('two funcs for one widget are refused', () => {
    declare(async () => undefined)
    assert.throws(() => declare(async () => undefined), /already exists/)
  })

  test("an addon's func is read and refreshed like the app's own", async () => {
    const widget = 'addonhealth.verdict'
    pikkuState('@acme/addon-health', 'attention', 'meta')[widget] = {
      widget,
      every: '15m',
      schedule: '*/15 * * * *',
    }
    addAttentionFunc(
      widget,
      pikkuAttentionFunc({ widget, every: '15m', func: async () => undefined }),
      '@acme/addon-health'
    )
    const result = await refresh('p1', widget)
    assert.equal(result?.status, 'quiet')
    assert.equal(
      (await getAttention(services(), { projectKey: 'p1', widget }))?.status,
      'quiet'
    )
    assert.equal(
      pikkuState(null, 'attention', 'meta')[widget]?.schedule,
      '*/15 * * * *'
    )
    assert.equal(
      pikkuState(null, 'scheduler', 'tasks').get(`attention.${widget}.refresh`)
        ?.schedule,
      '*/15 * * * *'
    )
  })

  test('a func with no CLI metadata is skipped, not registered', () => {
    const warn = console.warn
    console.warn = () => {}
    try {
      addAttentionFunc(
        'x.y',
        pikkuAttentionFunc({ widget: 'x.y', every: '1m', func: async () => {} })
      )
    } finally {
      console.warn = warn
    }
    assert.equal(pikkuState(null, 'attention', 'funcs').has('x.y'), false)
  })
})

describe('InMemoryAttentionResultStore', () => {
  test('list returns the latest run of every widget for one project only', async () => {
    const store = new InMemoryAttentionResultStore()
    const at = new Date('2026-11-24T10:00:00Z')
    await store.put({
      projectKey: 'p1',
      widget: 'health.verdict',
      status: 'quiet',
      updatedAt: at,
    })
    await store.put({
      projectKey: 'p1',
      widget: 'health.verdict',
      status: 'attention',
      score: { score: 0.5 },
      updatedAt: at,
    })
    await store.put({
      projectKey: 'p1',
      widget: 'deploys.latest',
      status: 'failed',
      error: 'down',
      updatedAt: at,
    })
    await store.put({
      projectKey: 'p2',
      widget: 'health.verdict',
      status: 'quiet',
      updatedAt: at,
    })
    const listed = (await store.list('p1')).sort((a, b) =>
      a.widget.localeCompare(b.widget)
    )
    assert.deepEqual(
      listed.map((r) => [r.widget, r.status]),
      [
        ['deploys.latest', 'failed'],
        ['health.verdict', 'attention'],
      ]
    )
    assert.deepEqual(await store.list('p3'), [])
  })

  test('a watched project with no run yet is not listed', async () => {
    const store = new InMemoryAttentionResultStore()
    await store.watch('p1', 'health.verdict')
    assert.deepEqual(await store.list('p1'), [])
    assert.deepEqual(await store.projectKeys('health.verdict'), ['p1'])
  })
})
