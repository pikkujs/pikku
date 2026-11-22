import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  cleanUp,
  fakeLauncher,
  git,
  haveCli,
  leased,
  pikku,
  pikkuJson,
  recordedCommands,
  scratchRepo,
  startRunner,
  until,
  worktrees,
} from './runner-harness.test.js'

afterAll(cleanUp)

/** The runner's lanes: the cap, tries, leases given back, the stall watchdog, a stop, a restart and the turn budget. */
describe.skipIf(!haveCli)('ChangesRunner lanes', () => {
  test('runs three agents in their own worktrees, releases a lease when an agent exits, gives up the worktree of a change that used its tries, and merges a finished one', async () => {
    const repo = await scratchRepo(['One', 'Two', 'Three', 'Four', 'Five'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake)
    await until('three agents', () => fake.agents.length === 3)
    expect(fake.agents.map((a) => a.id).sort()).toEqual(['1', '2', '3'])
    expect(new Set(fake.agents.map((a) => a.cwd)).size).toBe(3)
    for (const a of fake.agents)
      expect(a.cwd).toMatch(/pikku-run-[^/]+-changesets\/\d-/)
    expect(worktrees(repo).length).toBe(3)
    expect(fake.agents[0]!.env.PIKKU_CHANGES_BUILDER).toBe('1')
    expect(fake.agents[0]!.env.PIKKU_CHANGE_ID).toBe(fake.agents[0]!.id)
    await new Promise((r) => setTimeout(r, 500))
    expect(fake.agents.length).toBe(3)

    // #2 stops with #2 open: its lease is released at once and it is picked up again in the same worktree.
    const cwd2 = fake.started('2')[0]!.cwd
    fake.finish('2', 'quit')
    await until('#2 picked up again', () => fake.started('2').length === 2)
    expect(h.calls.some((c) => /^changes release \S+/.test(c.args))).toBe(true)
    expect(fake.started('2')[1]!.cwd).toBe(cwd2)
    expect(
      h.calls.some(
        (c) =>
          c.args.includes('--change-ids 2') && c.args.includes('--group-id')
      )
    ).toBe(true)

    // Its last try: the lease goes back, its worktree is removed (branch kept), and #4 takes the place.
    fake.finish('2', 'quit')
    await until('#4 to start', () => fake.started('4').length === 1)
    expect(leased(h.group('2'))).toBe(false)
    expect(existsSync(cwd2)).toBe(false)
    expect(git(repo, 'branch', '--list', 'changeset/*')).toMatch(
      /changeset\/2-/
    )
    expect(
      h
        .texts('abandoned')
        .some((t) =>
          /^#2: used its 2 tries this run: its worktree .* was removed, its branch kept$/.test(
            t
          )
        )
    ).toBe(true)
    expect(fake.started('2').length).toBe(2)

    // #1 is done: when its agent ends it is merged, its worktree and branch go, and #5 takes the place.
    const cwd1 = fake.started('1')[0]!.cwd
    fake.finish('1', 'done')
    await until('#5 to start', () => fake.started('5').length === 1)
    expect(existsSync(cwd1)).toBe(false)
    expect(existsSync(join(repo, 'feature-1.txt'))).toBe(true)
    expect(git(repo, 'branch', '--list', 'changeset/*')).not.toMatch(
      /changeset\/1-/
    )
    expect(
      h
        .texts('merged')
        .some((t) => /^Merged #1 One → main @ \w+, worktree removed/.test(t))
    ).toBe(true)
    expect(fake.most()).toBeLessThanOrEqual(3)

    // A stop: every agent is stopped, every lease goes back, and nothing starts after it.
    const before = fake.agents.length
    h.runner.stop()
    await h.done
    expect(h.result()!.ok).toBe(false)
    expect(fake.running()).toBe(0)
    expect(
      pikkuJson(repo, 'changes', 'list', '--include-done').groups.every(
        (g: { claimExpiresAt?: string | null }) => !leased(g)
      )
    ).toBe(true)
    await new Promise((r) => setTimeout(r, 300))
    expect(fake.agents.length).toBe(before)
  }, 240_000)

  test('an agent that goes quiet is stopped, its lease released, and its change picked up again', async () => {
    const repo = await scratchRepo(['One'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake, { stallMinutes: 0.01 })
    await until(
      'the stall',
      () =>
        h
          .texts('stalled')
          .some((t) =>
            /^#1: the agent went quiet.*goes back in the queue$/.test(t)
          ),
      30_000
    )
    await until(
      '#1 picked up again',
      () => fake.started('1').length === 2,
      30_000
    )
    const releasedAt = h.calls.findIndex((c) =>
      /^changes release \S+/.test(c.args)
    )
    expect(releasedAt).toBeGreaterThanOrEqual(0)
    expect(
      h.calls
        .slice(releasedAt)
        .some(
          (c) =>
            c.args.includes('--change-ids 1') && c.args.includes('--group-id')
        )
    ).toBe(true)
    expect(h.group('1').claimedBy).toBe('pikku-changes-run')
    h.runner.stop()
    await h.done
  }, 120_000)

  test('an agent with a tool running is spared by the stall watchdog; a tool past its limit is stopped and the change picked up again', async () => {
    const repo = await scratchRepo(['One'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake, {
      stallMinutes: 0.01,
      toolMaxMinutes: 0.05,
    })
    await until('#1 to start', () => fake.agents.length === 1)
    fake.agents[0]!.activity({ type: 'tool_start', id: 'c1' })
    await new Promise((r) => setTimeout(r, 1500)) // more than two stall periods
    expect(fake.agents[0]!.stopped).toBe(false)
    expect(h.texts('stalled')).toEqual([])
    await until(
      'the tool limit',
      () =>
        h
          .texts('stalled')
          .some((t) =>
            /had one tool running .* goes back in the queue/.test(t)
          ),
      30_000
    )
    expect(fake.agents[0]!.stopped).toBe(true)
    await until(
      '#1 picked up again',
      () => fake.started('1').length === 2,
      30_000
    )
    h.runner.stop()
    await h.done
  }, 120_000)

  test('a stop while a worktree is being set up starts no agent and gives the lease back', async () => {
    const repo = await scratchRepo(['One', 'Two'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake, { setupCommand: 'sleep 2' })
    await until('#1 claimed and being set up', () =>
      h.texts('claimed').some((t) => /^#1 One: agent 1 of/.test(t))
    )
    h.runner.stop()
    await h.done
    expect(fake.agents.length).toBe(0)
    expect(leased(h.group('1'))).toBe(false)
    expect(h.texts('claimed').some((t) => /^#2 /.test(t))).toBe(false)
    expect(
      h.texts().some((t) => /#1: not started, the run was stopped/.test(t))
    ).toBe(true)
  }, 120_000)

  test('after a restart, leases the runner left (its own, or under pikku-cli) are released and their changes started; a person’s lease is left alone', async () => {
    const repo = await scratchRepo(['One', 'Two', 'Three'])
    pikku(repo, [
      'changes',
      'claim',
      '--change-ids',
      '1',
      '--worktree',
      '--claimed-by',
      'pikku-changes-run',
      '--lease-minutes',
      '120',
      '--title',
      '#1 One',
    ])
    pikku(repo, [
      'changes',
      'claim',
      '--change-ids',
      '2',
      '--worktree',
      '--claimed-by',
      'pikku-cli',
      '--lease-minutes',
      '120',
      '--title',
      '#2 Two',
    ])
    pikku(repo, [
      'changes',
      'claim',
      '--change-ids',
      '3',
      '--claimed-by',
      'alice',
      '--lease-minutes',
      '120',
      '--title',
      '#3 Three',
    ])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake)
    await until('#1 and #2 to start', () => fake.agents.length === 2)
    expect(fake.agents.map((a) => a.id).sort()).toEqual(['1', '2'])
    expect(
      h.calls.filter((c) => /^changes release \S+/.test(c.args)).length
    ).toBe(2)
    expect(h.group('1').claimedBy).toBe('pikku-changes-run')
    expect(h.group('2').claimedBy).toBe('pikku-changes-run')
    expect(h.group('3').claimedBy).toBe('alice')
    expect(leased(h.group('3'))).toBe(true)
    h.runner.stop()
    await h.done
  }, 120_000)

  test('a lease that cannot be given back is said as an error', async () => {
    const repo = await scratchRepo(['One'])
    const fake = fakeLauncher()
    const commands = recordedCommands((args) =>
      args[0] === 'changes' && args[1] === 'release'
        ? { code: 1, output: 'the store is locked' }
        : undefined
    )
    const h = startRunner(repo, fake, { tries: 1 }, commands)
    await until('#1 to start', () => fake.agents.length === 1)
    fake.finish('1', 'quit')
    await until(
      'the failed release',
      () =>
        h
          .errors()
          .some((e) =>
            /^#1: could not give the lease of changeset \S+ back.*pikku changes release.*the store is locked/s.test(
              e
            )
          ),
      30_000
    )
    h.runner.stop()
    await h.done
  }, 120_000)

  test('every agent turn counts against maxTurns, and the run stops there', async () => {
    const repo = await scratchRepo(['One', 'Two'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake, { maxTurns: 3 })
    await until('two agents', () => fake.agents.length === 2)
    fake.finish('1', 'quit')
    await until('#1 picked up again', () => fake.started('1').length === 2)
    fake.finish('2', 'quit')
    await until(
      'the limit',
      () =>
        h
          .errors()
          .some((e) => /it started 3 agent turns .*the limit is 3/.test(e)),
      30_000
    )
    await new Promise((r) => setTimeout(r, 300))
    expect(fake.agents.length).toBe(3)
    h.runner.stop()
    await h.done
  }, 120_000)
})
