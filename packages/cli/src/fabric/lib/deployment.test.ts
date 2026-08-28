import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  blockedReason,
  classifyStatus,
  describeDeployment,
  destructiveMigrations,
  isApprovable,
  missingConfigHints,
  reconcileDeployedRef,
  stateLabel,
  waitForDeployment,
  type DeploymentStatus,
} from './deployment.js'
import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

type StatusRow = {
  status: string
  statusReason?: string | null
  missingSecrets?: { name: string }[]
  missingVariables?: { name: string }[]
}

function fakeRpc(script: StatusRow[]) {
  const calls: string[] = []
  let index = 0
  const rpc = {
    invoke: async (name: string, _data: unknown) => {
      calls.push(name)
      if (name === 'getDeploymentStatus') {
        const row = script[Math.min(index++, script.length - 1)]!
        return {
          status: row.status,
          statusReason: row.statusReason ?? null,
          stageId: 'stage-1',
          stageType: 'production',
          hostname: row.status === 'active' ? 'app.example.com' : null,
          dispatchNamespace: null,
          manifest: {},
          missingSecrets: (row.missingSecrets ?? []).map((s) => ({
            ...s,
            displayName: null,
            description: null,
            docsUrl: null,
          })),
          missingVariables: (row.missingVariables ?? []).map((s) => ({
            ...s,
            displayName: null,
            description: null,
            docsUrl: null,
          })),
        }
      }
      if (name === 'applyDeployment') {
        return { deploymentId: 'dep-1', resumed: true }
      }
      throw new Error(`unexpected rpc ${name}`)
    },
  } as unknown as PikkuRPC
  return { rpc, calls }
}

function fakeClock() {
  let clock = 0
  return {
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms
    },
  }
}

const run = (
  script: StatusRow[],
  {
    approve = async () => false,
    timeoutMs = 900_000,
  }: {
    approve?: (s: DeploymentStatus) => Promise<boolean>
    timeoutMs?: number
  } = {}
) => {
  const { rpc, calls } = fakeRpc(script)
  const { now, sleep } = fakeClock()
  const events: string[] = []
  return waitForDeployment({
    rpc,
    deploymentId: 'dep-1',
    timeoutMs,
    approve,
    onEvent: (e) => events.push(e.event),
    sleep,
    now,
  }).then((result) => ({ result, events, calls }))
}

describe('classifyStatus', () => {
  test('recognises fabric’s in-flight ladder', () => {
    for (const s of ['queued', 'planning', 'building', 'deploying']) {
      assert.strictEqual(classifyStatus(s), 'in_flight')
    }
  })

  test('active is the only success', () => {
    assert.strictEqual(classifyStatus('active'), 'succeeded')
    assert.strictEqual(classifyStatus('rolled_back'), 'failed')
  })

  test('every terminal failure is failed, not in-flight', () => {
    for (const s of ['failed', 'error', 'timed_out', 'cancelled']) {
      assert.strictEqual(classifyStatus(s), 'failed')
    }
  })

  test('an unknown status is in-flight, so the timeout bounds it', () => {
    assert.strictEqual(classifyStatus('rehydrating'), 'in_flight')
  })
})

describe('blocked reasons', () => {
  test('only awaiting_approval can be approved', () => {
    assert.ok(isApprovable(blockedReason('awaiting_approval')))
    assert.ok(!isApprovable(blockedReason('needs_config')))
    assert.ok(!isApprovable(blockedReason('needs_attention')))
    assert.ok(!isApprovable(blockedReason(null)))
  })

  test('labels match the console vocabulary', () => {
    assert.strictEqual(stateLabel('suspended', 'awaiting_approval'), 'planned')
    assert.strictEqual(
      stateLabel('suspended', 'needs_config'),
      'config required'
    )
    assert.strictEqual(
      stateLabel('suspended', 'needs_attention'),
      'needs attention'
    )
    assert.strictEqual(stateLabel('active', null), 'live')
  })
})

describe('missingConfigHints', () => {
  test('a missing secret names the secrets command', () => {
    assert.deepEqual(missingConfigHints([{ name: 'GRAPH_PASSWORD' }], []), [
      'Set the secret with `pikku fabric secrets set <name>`: GRAPH_PASSWORD.',
    ])
  })

  test('a missing variable names the variables command, not the secrets one', () => {
    const [hint, ...rest] = missingConfigHints([], [{ name: 'GRAPH_URI' }])
    assert.equal(rest.length, 0)
    assert.ok(!hint!.includes('secrets set'), hint)
    assert.ok(hint!.includes('variables set'), hint)
    assert.ok(hint!.includes('GRAPH_URI'), hint)
  })

  test('both missing gets both hints, secrets first', () => {
    const hints = missingConfigHints(
      [{ name: 'GRAPH_PASSWORD' }],
      [{ name: 'GRAPH_URI' }, { name: 'GRAPH_USER' }]
    )
    assert.equal(hints.length, 2)
    assert.ok(hints[0]!.includes('secrets set'))
    assert.ok(hints[1]!.includes('GRAPH_URI, GRAPH_USER'))
  })

  test('several of a kind are pluralised', () => {
    assert.ok(
      missingConfigHints([{ name: 'A' }, { name: 'B' }], [])[0]!.includes(
        'Set the secrets'
      )
    )
    assert.ok(
      missingConfigHints([], [{ name: 'A' }, { name: 'B' }])[0]!.includes(
        'Set the variables'
      )
    )
  })

  test('blocked on config with neither list still names both commands', () => {
    for (const hints of [
      missingConfigHints([], []),
      missingConfigHints(undefined, undefined),
    ]) {
      assert.equal(hints.length, 1)
      assert.ok(hints[0]!.includes('secrets set'), hints[0])
      assert.ok(hints[0]!.includes('variables set'), hints[0])
    }
  })
})

describe('waitForDeployment', () => {
  test('polls through the ladder to active', async () => {
    const { result, events } = await run([
      { status: 'queued' },
      { status: 'building' },
      { status: 'deploying' },
      { status: 'active' },
    ])
    assert.strictEqual(result.outcome, 'succeeded')
    assert.strictEqual(result.hostname, 'app.example.com')
    assert.deepStrictEqual(events, ['status', 'status', 'status', 'status'])
  })

  test('a terminal failure ends the wait immediately', async () => {
    const { result } = await run([{ status: 'building' }, { status: 'failed' }])
    assert.strictEqual(result.outcome, 'failed')
  })

  test('needs_config never asks to approve — applyDeployment would refuse', async () => {
    let asked = false
    const { result, calls } = await run(
      [
        {
          status: 'suspended',
          statusReason: 'needs_config',
          missingSecrets: [{ name: 'STRIPE_KEY' }],
        },
      ],
      {
        approve: async () => {
          asked = true
          return true
        },
      }
    )
    assert.strictEqual(result.outcome, 'blocked')
    assert.strictEqual(result.reason, 'needs_config')
    assert.deepStrictEqual(
      result.missingSecrets.map((s) => s.name),
      ['STRIPE_KEY']
    )
    assert.ok(!asked, 'must not offer to approve a config-blocked plan')
    assert.ok(!calls.includes('applyDeployment'))
  })

  test('a declined approval ends the wait rather than spinning', async () => {
    const { result, calls } = await run(
      [{ status: 'suspended', statusReason: 'awaiting_approval' }],
      { approve: async () => false }
    )
    assert.strictEqual(result.outcome, 'blocked')
    assert.strictEqual(result.approved, false)
    assert.ok(!calls.includes('applyDeployment'))
  })

  test('an accepted approval applies and then keeps polling to active', async () => {
    const { result, calls, events } = await run(
      [
        { status: 'suspended', statusReason: 'awaiting_approval' },
        { status: 'deploying' },
        { status: 'active' },
      ],
      { approve: async () => true }
    )
    assert.strictEqual(result.outcome, 'succeeded')
    assert.strictEqual(result.approved, true)
    assert.strictEqual(
      calls.filter((c) => c === 'applyDeployment').length,
      1,
      'approve exactly once'
    )
    assert.ok(events.includes('blocked'))
    assert.ok(events.includes('approved'))
  })

  test('a gate that does not move after approval reports blocked, not timeout', async () => {
    const { result, calls } = await run(
      [{ status: 'suspended', statusReason: 'awaiting_approval' }],
      { approve: async () => true }
    )
    assert.strictEqual(result.outcome, 'blocked')
    assert.strictEqual(result.approved, true)
    assert.strictEqual(calls.filter((c) => c === 'applyDeployment').length, 1)
  })

  test('a resume that takes a few polls to move is not called blocked', async () => {
    const { result, calls } = await run(
      [
        { status: 'suspended', statusReason: 'awaiting_approval' },
        { status: 'suspended', statusReason: 'awaiting_approval' },
        { status: 'suspended', statusReason: 'awaiting_approval' },
        { status: 'deploying' },
        { status: 'active' },
      ],
      { approve: async () => true }
    )
    assert.strictEqual(result.outcome, 'succeeded')
    assert.strictEqual(result.approved, true)
    assert.strictEqual(
      calls.filter((c) => c === 'applyDeployment').length,
      1,
      'approve exactly once, however many polls the resume takes'
    )
  })

  test('the blocked event is emitted once, not once per poll', async () => {
    const { events } = await run(
      [
        { status: 'suspended', statusReason: 'awaiting_approval' },
        { status: 'suspended', statusReason: 'awaiting_approval' },
        { status: 'deploying' },
        { status: 'active' },
      ],
      { approve: async () => true }
    )
    assert.strictEqual(events.filter((e) => e === 'blocked').length, 1)
  })

  test('a deploy that never lands times out inside the bound', async () => {
    const { result } = await run([{ status: 'deploying' }], {
      timeoutMs: 30_000,
    })
    assert.strictEqual(result.outcome, 'timeout')
    assert.ok(result.elapsedMs >= 30_000)
    assert.ok(result.elapsedMs < 60_000, 'must not overshoot the bound')
  })

  test('only status changes emit a status event', async () => {
    const { events } = await run([
      { status: 'building' },
      { status: 'building' },
      { status: 'building' },
      { status: 'active' },
    ])
    assert.deepStrictEqual(events, ['status', 'status'])
  })
})

describe('describeDeployment', () => {
  test('asks for dismissed deployments — a cancelled deploy is usually one', async () => {
    let asked: any
    const rpc = {
      invoke: async (name: string, data: unknown) => {
        assert.strictEqual(name, 'getProjectDeployments')
        asked = data
        return {
          stages: [
            {
              stageId: 'stage-1',
              branch: 'main',
              url: null,
              deployments: [
                {
                  deploymentId: 'dep-1',
                  status: 'cancelled',
                  statusReason: null,
                  gitSha: 'abc1234',
                  diff: null,
                  plan: null,
                  migrations: [],
                },
              ],
            },
          ],
        }
      },
    } as unknown as PikkuRPC

    const found = await describeDeployment(rpc, 'proj-1', 'dep-1')
    assert.strictEqual(asked.includeDismissed, true)
    assert.strictEqual(found?.branch, 'main')
    assert.strictEqual(found?.status, 'cancelled')
  })

  test('scopes migration risks to what is still pending', async () => {
    const rpc = {
      invoke: async () => ({
        stages: [
          {
            stageId: 'stage-1',
            branch: 'main',
            url: null,
            deployments: [
              {
                deploymentId: 'dep-1',
                status: 'suspended',
                statusReason: 'awaiting_approval',
                gitSha: 'abc1234',
                diff: null,
                plan: {
                  pendingMigrations: ['0001_init', '0002_drop_users'],
                  migrationRisks: [
                    { name: '0001_init', level: 'safe', reasons: [] },
                    {
                      name: '0002_drop_users',
                      level: 'destructive',
                      reasons: ['drop_table'],
                    },
                    {
                      name: '0000_old',
                      level: 'destructive',
                      reasons: ['truncate'],
                    },
                  ],
                },
                migrations: [{ migrationName: '0000_old' }],
              },
            ],
          },
        ],
      }),
    } as unknown as PikkuRPC

    const found = await describeDeployment(rpc, 'proj-1', 'dep-1')
    assert.deepStrictEqual(found?.changes?.pendingMigrations, [
      '0001_init',
      '0002_drop_users',
    ])
    assert.deepStrictEqual(
      found?.changes?.migrationRisks.map((r) => r.name),
      ['0001_init', '0002_drop_users']
    )
    assert.deepStrictEqual(destructiveMigrations(found?.changes), [
      {
        name: '0002_drop_users',
        level: 'destructive',
        reasons: ['drop_table'],
      },
    ])
  })

  test('drops malformed risk entries rather than failing the deploy', async () => {
    const rpc = {
      invoke: async () => ({
        stages: [
          {
            stageId: 'stage-1',
            branch: 'main',
            url: null,
            deployments: [
              {
                deploymentId: 'dep-1',
                status: 'suspended',
                statusReason: 'awaiting_approval',
                gitSha: null,
                diff: null,
                plan: {
                  pendingMigrations: ['0001_init'],
                  migrationRisks: [
                    null,
                    { name: '0001_init', level: 'unheard-of' },
                    { level: 'destructive', reasons: ['drop_table'] },
                    {
                      name: '0001_init',
                      level: 'destructive',
                      reasons: 'nope',
                    },
                  ],
                },
                migrations: [],
              },
            ],
          },
        ],
      }),
    } as unknown as PikkuRPC

    const found = await describeDeployment(rpc, 'proj-1', 'dep-1')
    assert.deepStrictEqual(found?.changes?.migrationRisks, [
      { name: '0001_init', level: 'destructive', reasons: [] },
    ])
  })

  test('returns null rather than throwing when the listing has no such row', async () => {
    const rpc = {
      invoke: async () => ({ stages: [] }),
    } as unknown as PikkuRPC
    assert.strictEqual(await describeDeployment(rpc, 'proj-1', 'nope'), null)
  })
})

/**
 * `deploy apply --branch main` reported the sha it was asked for while the
 * deployment it had attached to was pinned to a different commit — a revert
 * that printed `599439e6` and held `5bfe84c`, five commits above it. The only
 * symptom was a correct-looking line of output, and the failure mode is a
 * rollback that silently does not roll back.
 */
describe('reconcileDeployedRef', () => {
  const requested = '599439e6c0ffee0000000000000000000000abcd'

  test('returns the sha the deployment actually holds', () => {
    const ref = reconcileDeployedRef({
      requested,
      actual: requested,
      deploymentId: 'dep-1',
    })
    assert.strictEqual(ref, requested)
  })

  test('throws when the deployment holds a different commit', () => {
    assert.throws(
      () =>
        reconcileDeployedRef({
          requested,
          actual: '5bfe84ce315780a1580b6a3c80be58bba81d1eaf',
          deploymentId: 'e0d4ffea-a63d-4712-ae09-db98baabccac',
        }),
      (error: Error) => {
        assert.match(error.message, /599439e6/)
        assert.match(error.message, /5bfe84ce/)
        assert.match(error.message, /e0d4ffea/)
        return true
      }
    )
  })

  test('falls back to the requested sha when the server reports none', () => {
    const ref = reconcileDeployedRef({
      requested,
      actual: null,
      deploymentId: 'dep-1',
    })
    assert.strictEqual(ref, requested)
  })
})
