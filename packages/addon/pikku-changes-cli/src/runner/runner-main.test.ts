import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { processCommands } from './commands.js'
import {
  CLI,
  cleanUp,
  fakeLauncher,
  git,
  haveCli,
  leased,
  pikku,
  recordedCommands,
  scratchRepo,
  startRunner,
  until,
  worktrees,
} from './runner-harness.test.js'
import type { RunnerCommands } from './types.js'

afterAll(cleanUp)

/** The runner's work in the main checkout: a red check and its repair, merge conflicts, routes it does not run, worktrees that do not start clean, and the startup self-check. */
describe.skipIf(!haveCli)('ChangesRunner main checkout', () => {
  test('a merge that leaves the main checkout failing its check holds new agents until an agent repairs it there', async () => {
    const repo = await scratchRepo(['One', 'Two'])
    const fake = fakeLauncher(async (agent) => {
      if (agent.kind !== 'repair') return
      await rm(join(agent.cwd, 'feature-1.txt'), { force: true })
      git(agent.cwd, 'commit', '-q', '-am', 'repair main')
    })
    const h = startRunner(repo, fake, {
      checkCommand:
        'test ! -f feature-1.txt || { echo feature-1 breaks the build; exit 1; }',
    })
    await until('two agents', () => fake.agents.length === 2)
    fake.finish('1', 'done')
    await until(
      'the main checkout found failing',
      () =>
        h
          .errors()
          .some((e) =>
            /The main checkout fails the check after a merge.*feature-1 breaks the build/.test(
              e
            )
          ),
      60_000
    )
    expect(existsSync(join(repo, 'feature-1.txt'))).toBe(true)
    expect(fake.started('main').length).toBe(0)
    fake.finish('2', 'quit')
    await until('the repair', () => fake.started('main').length === 1, 60_000)
    const repair = fake.started('main')[0]!
    expect(repair.kind).toBe('repair')
    expect(repair.cwd).toBe(repo)
    expect(repair.prompt).toMatch(/repairing the main checkout/)
    await until(
      '#2 picked up again once it passes',
      () => fake.started('2').length === 2,
      60_000
    )
    const nexts = h.calls.filter((c) => /^changes next --parallel/.test(c.args))
    expect(nexts[0]!.args).not.toMatch(/--no-merge/)
    expect(nexts.some((c) => /--no-merge/.test(c.args))).toBe(true)
    expect(h.texts('repair')).toContain(
      'An agent is repairing the main checkout (repair 1 of 2)'
    )
    expect(h.texts('green').length).toBe(1)
    const order = fake.agents.map((a) => a.id)
    expect(order.indexOf('main')).toBeLessThan(order.lastIndexOf('2'))
    h.runner.stop()
    await h.done
  }, 180_000)

  test('a merge conflict left unresolved gets two turns, then its changeset is given up and the run stops; the main checkout is checked after a conflict turn', async () => {
    const repo = await scratchRepo(['One'])
    pikku(repo, [
      'changes',
      'claim',
      '--change-ids',
      '1',
      '--worktree',
      '--claimed-by',
      'alice',
      '--lease-minutes',
      '120',
      '--title',
      '#1 One',
    ])
    const worktree = worktrees(repo)[0]!.match(/^worktree (.+)$/m)![1]!
    const conflict = {
      agent: 'changes',
      skill: 'pikku-changes',
      refs: [],
      reason: '“#1 One” conflicts with main',
      context:
        '# Merge conflict\n\n“#1 One” (changeset/1-one) conflicts with main in:\n\n- a.txt\n',
      merged: [],
    }
    const checks = join(repo, '.git', 'checks')
    const fake = fakeLauncher()
    const commands = recordedCommands((args) =>
      args[1] === 'next'
        ? { code: 0, output: JSON.stringify(conflict) }
        : undefined
    )
    const h = startRunner(
      repo,
      fake,
      { checkCommand: `echo checked >> ${checks}` },
      commands
    )
    await h.done
    expect(h.result()!.ok).toBe(false)
    expect(h.result()!.reason).toMatch(
      /2 merge-conflict turns did not resolve it \(the conflictTries option\), so the run stopped/
    )
    expect(fake.agents.map((a) => a.kind)).toEqual(['conflict', 'conflict'])
    expect(h.texts('conflict').join('\n')).toMatch(
      /merge-conflict turn 1 of 2[\s\S]*merge-conflict turn 2 of 2/
    )
    expect(existsSync(checks)).toBe(true)
    expect(existsSync(worktree)).toBe(false)
    expect(git(repo, 'branch', '--list', 'changeset/*')).toMatch(
      /changeset\/1-one/
    )
    expect(leased(h.group('1'))).toBe(false)
    expect(
      h
        .errors()
        .filter((e) => /merge-conflict turns did not resolve it/.test(e)).length
    ).toBe(1)
  }, 120_000)

  test('with the plan built, knowledge gaps or an upgrade end the run instead of growing the scope', async () => {
    const repo = await scratchRepo([])
    for (const [agent, context] of [
      ['knowledge', '# Knowledge no change builds yet\n\n- a note'],
      ['upgrade', '# pikku 1 → 2'],
    ]) {
      const route = {
        agent,
        skill: 'pikku-knowledge',
        refs: [],
        reason: `${agent} route`,
        context,
        merged: [],
      }
      const fake = fakeLauncher()
      const h = startRunner(
        repo,
        fake,
        {},
        recordedCommands((args) =>
          args[1] === 'next'
            ? { code: 0, output: JSON.stringify(route) }
            : undefined
        )
      )
      await h.done
      expect(fake.agents.length).toBe(0)
      expect(h.result()!.ok).toBe(true)
      expect(h.result()!.reason).toBe(
        `The run ends here: nothing planned is left to build, and it does not start “${agent} route” (${agent} work) on its own.`
      )
    }
  }, 60_000)

  test('a worktree that does not start clean is not handed to an agent, its lease is released and it is removed', async () => {
    const repo = await scratchRepo(['One'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake, {
      setupCommand: 'true',
      checkCommand:
        'case "$PWD" in *-changesets/*) echo type error in a.ts; false;; esac',
    })
    await h.done
    expect(h.result()!.ok).toBe(false)
    expect(fake.agents.length).toBe(0)
    expect(h.errors().join('\n')).toMatch(
      /#1: the worktree does not start clean.*type error in a\.ts/
    )
    expect(worktrees(repo).length).toBe(0)
    expect(leased(h.group('1'))).toBe(false)
  }, 120_000)

  test('the startup self-check refuses to start and lists every problem at once', async () => {
    const repo = await scratchRepo(['One'])
    await writeFile(join(repo, 'stray.txt'), 'left here\n')
    const real = processCommands(CLI, 'node')
    let cliCalls = 0
    const commands: RunnerCommands = {
      ...real,
      pikku: async (cwd, args, env) => (cliCalls++, real.pikku(cwd, args, env)),
      // No identity on this machine, as far as the runner can tell.
      git: async (cwd, args) =>
        args[0] === 'config' && args[1] === 'user.email'
          ? { code: 1, output: '' }
          : real.git(cwd, args),
    }
    const fake = fakeLauncher()
    const h = startRunner(
      repo,
      fake,
      {
        selfCheck: true,
        localCli: { bin: join(repo, 'no-such-cli.js'), checkout: repo },
        extraChecks: async () => ['A model login is missing.'],
      },
      { commands, calls: [] }
    )
    await h.done
    const reason = h.result()!.reason
    expect(h.result()!.ok).toBe(false)
    expect(
      reason.startsWith('The runner did not start. Fix these first:\n')
    ).toBe(true)
    expect(reason).toContain(
      `- The pikku CLI ${join(repo, 'no-such-cli.js')} does not exist`
    )
    expect(reason).toContain('- The project has no git identity')
    expect(reason).toMatch(
      /- The main checkout has uncommitted files .*stray\.txt/
    )
    expect(reason).toContain('- A model login is missing.')
    expect(h.errors()).toEqual([reason])
    expect(cliCalls).toBe(0)
    expect(fake.agents.length).toBe(0)
  }, 60_000)

  test('a host check can report what it fixed, and the run starts', async () => {
    const repo = await scratchRepo(['One'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake, {
      selfCheck: true,
      extraChecks: async () => ({
        problems: [],
        done: ['A repository setting was missing: it was added.'],
      }),
    })
    await until('#1 to start', () => fake.agents.length === 1, 60_000)
    expect(
      h
        .texts('self-check')
        .some((t) => /A repository setting was missing/.test(t))
    ).toBe(true)
    h.runner.stop()
    await h.done
  }, 120_000)
})
