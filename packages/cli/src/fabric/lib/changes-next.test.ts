import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  FabricAuthError,
  MAX_CONSECUTIVE_FAILURES,
  waitForNext,
  type NextOptions,
} from './changes-next.js'
import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

const NOW = Date.parse('2026-09-29T12:00:00Z')

const change = (overrides: Record<string, unknown> = {}) => ({
  changeId: 'chg_1',
  shortId: '1',
  title: 'Make the total stand out',
  status: 'open',
  groupId: null,
  route: '/checkout',
  held: false,
  createdAt: new Date(NOW - 5 * 60_000).toISOString(),
  ...overrides,
})

const group = (overrides: Record<string, unknown> = {}) => ({
  groupId: 'grp_1',
  title: 'Checkout pass',
  claimedBy: 'someone-else',
  claimExpiresAt: new Date(NOW + 10 * 60_000).toISOString(),
  ...overrides,
})

type Handler = (data: any) => unknown

/**
 * An rpc whose `listChanges` answers come off a queue, one per poll, with the
 * last answer repeating — a queue that never empties is what a quiet project
 * looks like.
 */
const fakeRpc = (lists: unknown[], handlers: Record<string, Handler> = {}) => {
  const calls: { name: string; data: any }[] = []
  let polls = 0
  const rpc = {
    invoke: async (name: string, data: any) => {
      calls.push({ name, data })
      if (name === 'listChanges') {
        const next = lists[Math.min(polls++, lists.length - 1)]
        if (next instanceof Error) throw next
        return next
      }
      const handler = handlers[name]
      if (!handler) throw new Error(`unexpected rpc ${name}`)
      return handler(data)
    },
  } as unknown as PikkuRPC
  return { rpc, calls }
}

const fakeClock = () => {
  let now = NOW
  const sleeps: number[] = []
  return {
    sleeps,
    clock: {
      now: () => now,
      sleep: async (ms: number) => {
        sleeps.push(ms)
        now += ms
      },
    },
  }
}

const options = (overrides: Partial<NextOptions> = {}): NextOptions => ({
  projectId: 'proj_1',
  claim: false,
  leaseMinutes: 30,
  intervalMs: 15_000,
  timeoutMs: null,
  once: false,
  ...overrides,
})

const httpError = (status: number, message = 'nope') =>
  Object.assign(new Error(message), { status })

const empty = { changes: [], groups: [] }

describe('waitForNext', () => {
  test('returns straight away when something is claimable', async () => {
    const { rpc, calls } = fakeRpc([{ changes: [change()], groups: [] }])
    const { clock, sleeps } = fakeClock()
    const result = await waitForNext(rpc, options(), clock)
    assert.strictEqual(result.outcome, 'ready')
    assert.deepStrictEqual(
      result.changes.map((c) => c.changeId),
      ['chg_1']
    )
    assert.deepStrictEqual(sleeps, [])
    assert.strictEqual(calls.length, 1)
  })

  test('asks the server for pickup-only work on the named stage', async () => {
    const { rpc, calls } = fakeRpc([{ changes: [change()], groups: [] }])
    await waitForNext(
      rpc,
      options({ stageId: 'stage_dev', route: '/checkout' }),
      fakeClock().clock
    )
    const list = calls[0]!.data
    assert.strictEqual(list.pickupOnly, true)
    assert.strictEqual(list.stageId, 'stage_dev')
    assert.strictEqual(list.route, '/checkout')
    assert.deepStrictEqual(list.status, ['open', 'claimed'])
  })

  test('waits out the grace window instead of returning a held item', async () => {
    const { rpc } = fakeRpc([
      { changes: [change({ held: true })], groups: [] },
      { changes: [change({ held: false })], groups: [] },
    ])
    const { clock, sleeps } = fakeClock()
    const result = await waitForNext(rpc, options(), clock)
    assert.strictEqual(result.outcome, 'ready')
    assert.deepStrictEqual(sleeps, [15_000])
  })

  test('skips items inside a live lease, its own included', async () => {
    const { rpc } = fakeRpc([
      {
        changes: [
          change({ status: 'claimed', groupId: 'grp_1' }),
          change({ changeId: 'chg_2', status: 'claimed', groupId: 'grp_2' }),
        ],
        groups: [
          group(),
          group({ groupId: 'grp_2', claimedBy: 'claude-code' }),
        ],
      },
    ])
    const result = await waitForNext(
      rpc,
      options({ once: true, claimedBy: 'claude-code' }),
      fakeClock().clock
    )
    assert.strictEqual(result.outcome, 'timeout')
  })

  test('picks up a claimed item whose lease has lapsed', async () => {
    const { rpc } = fakeRpc([
      {
        changes: [change({ status: 'claimed', groupId: 'grp_1' })],
        groups: [
          group({ claimExpiresAt: new Date(NOW - 60_000).toISOString() }),
        ],
      },
    ])
    const result = await waitForNext(rpc, options(), fakeClock().clock)
    assert.strictEqual(result.changes.length, 1)
  })

  test('times out with nothing, never sleeping past the deadline', async () => {
    const { rpc } = fakeRpc([empty])
    const { clock, sleeps } = fakeClock()
    const result = await waitForNext(rpc, options({ timeoutMs: 40_000 }), clock)
    assert.strictEqual(result.outcome, 'timeout')
    assert.deepStrictEqual(sleeps, [15_000, 15_000, 10_000])
  })

  test('--once checks a single time', async () => {
    const { rpc, calls } = fakeRpc([empty])
    const { clock, sleeps } = fakeClock()
    const result = await waitForNext(rpc, options({ once: true }), clock)
    assert.strictEqual(result.outcome, 'timeout')
    assert.strictEqual(calls.length, 1)
    assert.deepStrictEqual(sleeps, [])
  })

  test('--claim takes what it found as one group', async () => {
    const claimed = {
      group: group({ claimedBy: 'claude-code' }),
      changes: [change({ status: 'claimed', groupId: 'grp_1' })],
    }
    const { rpc, calls } = fakeRpc(
      [{ changes: [change(), change({ changeId: 'chg_2' })], groups: [] }],
      { claimChanges: () => claimed }
    )
    const result = await waitForNext(
      rpc,
      options({ claim: true, claimedBy: 'claude-code' }),
      fakeClock().clock
    )
    const claim = calls.find((call) => call.name === 'claimChanges')!.data
    assert.deepStrictEqual(claim.changeIds, ['chg_1', 'chg_2'])
    assert.strictEqual(claim.claimedBy, 'claude-code')
    assert.strictEqual(claim.title, 'Changes on /checkout')
    assert.strictEqual(result.claimed, claimed)
  })

  test('--claim that loses the race keeps waiting', async () => {
    let attempts = 0
    const { rpc } = fakeRpc([{ changes: [change()], groups: [] }], {
      claimChanges: () => {
        attempts++
        if (attempts === 1)
          throw httpError(409, 'no claimable items in that set')
        return { group: group(), changes: [change()] }
      },
    })
    const { clock, sleeps } = fakeClock()
    const result = await waitForNext(
      rpc,
      options({ claim: true, claimedBy: 'claude-code' }),
      clock
    )
    assert.strictEqual(attempts, 2)
    assert.deepStrictEqual(sleeps, [15_000])
    assert.ok(result.claimed)
  })

  describe('answers', () => {
    const answeredList = {
      changes: [change({ status: 'in_progress', groupId: 'grp_1' })],
      groups: [group({ claimedBy: 'claude-code' })],
    }
    const thread = (...authors: string[]) => ({
      thread: authors.map((authorKind) => ({ authorKind })),
    })

    test('wake the claimant whose question was answered', async () => {
      const { rpc, calls } = fakeRpc([answeredList], {
        getChange: () => thread('agent', 'user'),
      })
      const result = await waitForNext(
        rpc,
        options({ claimedBy: 'claude-code' }),
        fakeClock().clock
      )
      assert.deepStrictEqual(calls[0]!.data.status, [
        'open',
        'claimed',
        'in_progress',
      ])
      assert.deepStrictEqual(
        result.answered.map((c) => c.changeId),
        ['chg_1']
      )
    })

    test('stop counting once the agent has replied', async () => {
      const { rpc } = fakeRpc([answeredList], {
        getChange: () => thread('agent', 'user', 'agent'),
      })
      const result = await waitForNext(
        rpc,
        options({ claimedBy: 'claude-code', once: true }),
        fakeClock().clock
      )
      assert.strictEqual(result.outcome, 'timeout')
    })

    test('belong to whoever holds the group', async () => {
      const { rpc } = fakeRpc([answeredList], {
        getChange: () => thread('agent', 'user'),
      })
      const result = await waitForNext(
        rpc,
        options({ claimedBy: 'another-agent', once: true }),
        fakeClock().clock
      )
      assert.strictEqual(result.outcome, 'timeout')
    })
  })

  describe('failures', () => {
    test('a network blip backs off and carries on', async () => {
      const { rpc } = fakeRpc([
        new TypeError('fetch failed'),
        httpError(503),
        { changes: [change()], groups: [] },
      ])
      const { clock, sleeps } = fakeClock()
      const result = await waitForNext(rpc, options(), clock)
      assert.strictEqual(result.outcome, 'ready')
      assert.deepStrictEqual(sleeps, [15_000, 30_000])
    })

    test('a refused session stops at once with its own error', async () => {
      const { rpc } = fakeRpc([httpError(401, 'Unauthorized')])
      const { clock, sleeps } = fakeClock()
      await assert.rejects(
        waitForNext(rpc, options(), clock),
        (error: unknown) =>
          error instanceof FabricAuthError &&
          /pikku fabric login/.test(error.message)
      )
      assert.deepStrictEqual(sleeps, [])
    })

    test('an outage that does not end gives up', async () => {
      const { rpc, calls } = fakeRpc([new TypeError('fetch failed')])
      await assert.rejects(
        waitForNext(rpc, options(), fakeClock().clock),
        /Gave up after 8 failed attempts/
      )
      assert.strictEqual(calls.length, MAX_CONSECUTIVE_FAILURES)
    })

    test('a request the server rejects is not retried', async () => {
      const { rpc, calls } = fakeRpc([httpError(400, 'bad stage')])
      await assert.rejects(
        waitForNext(rpc, options(), fakeClock().clock),
        /bad stage/
      )
      assert.strictEqual(calls.length, 1)
    })
  })
})
