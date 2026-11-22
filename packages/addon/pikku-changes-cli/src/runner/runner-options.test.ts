import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  cleanUp,
  fakeLauncher,
  haveCli,
  pikku,
  recordedCommands,
  scratchRepo,
  startRunner,
  until,
} from './runner-harness.test.js'
import type { PromptContext } from './types.js'

afterAll(cleanUp)

/** The host-facing options: the specialist and route an agent starts with, refill, step mode, extra routes and the counters. */
describe.skipIf(!haveCli)('ChangesRunner host options', () => {
  test('an agent start and its prompt carry the change specialist and the route', async () => {
    const repo = await scratchRepo(['One'])
    const fake = fakeLauncher()
    const contexts: PromptContext[] = []
    const commands = recordedCommands()
    const real = commands.commands.pikku
    commands.commands.pikku = async (cwd, args, env) => {
      const result = await real(cwd, args, env)
      if (args[0] !== 'changes' || args[1] !== 'list') return result
      const lines = result.output.split('\n')
      const at = lines.findLastIndex((l) => l.startsWith('{'))
      const json = JSON.parse(lines[at]!)
      for (const change of json.changes) change.specialist = 'ui'
      lines[at] = JSON.stringify(json)
      return { ...result, output: lines.join('\n') }
    }
    const h = startRunner(
      repo,
      fake,
      {
        prompts: {
          build: (context) => (contexts.push(context), 'build it'),
        },
      },
      commands
    )
    await until('#1 to start', () => fake.agents.length === 1)
    const agent = fake.agents[0]!
    expect(agent.specialist).toBe('ui')
    expect(agent.change?.specialist).toBe('ui')
    expect(agent.route?.agent).toBe('changes')
    expect(contexts[0]!.specialist).toBe('ui')
    h.runner.stop()
    await h.done
  }, 120_000)

  test('refill looks for newly ready changes now, and does nothing before a run, after a stop or when nothing is new', async () => {
    const repo = await scratchRepo(['One'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake, {})
    await until('#1 to start', () => fake.agents.length === 1)
    await until(
      'the fill to settle',
      () => h.calls.filter((c) => /^changes next/.test(c.args)).length >= 2
    )
    const nexts = () =>
      h.calls.filter((c) => /^changes next/.test(c.args)).length
    pikku(repo, ['changes', 'file', '--title', 'Two'])
    h.runner.refill()
    await until('#2 to start while #1 runs', () => fake.agents.length === 2)
    h.runner.refill()
    await until('the empty look', () => nexts() >= 4)
    expect(fake.agents.length).toBe(2)
    h.runner.stop()
    await h.done
    const before = nexts()
    h.runner.refill()
    await new Promise((r) => setTimeout(r, 300))
    expect(nexts()).toBe(before)
  }, 120_000)

  test('step claims and builds the first changes, claims no more, merges nothing until mergeFinished, and ends stepped without an error', async () => {
    const repo = await scratchRepo(['One', 'Two', 'Three'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake, { step: true, parallel: 2 })
    await until('two agents', () => fake.agents.length === 2)
    fake.finish('1', 'quit')
    await until('#1 picked up again', () => fake.started('1').length === 2)
    fake.finish('1', 'done')
    fake.finish('2', 'done')
    const result = await h.done
    expect(result.stepped).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.merged).toEqual([])
    expect(fake.started('3').length).toBe(0)
    expect(existsSync(join(repo, 'feature-1.txt'))).toBe(false)
    expect(h.texts('stepped').length).toBe(1)
    const { merged, red } = await h.runner.mergeFinished()
    expect(merged.length).toBe(2)
    expect(red).toBeNull()
    expect(existsSync(join(repo, 'feature-1.txt'))).toBe(true)
    expect(existsSync(join(repo, 'feature-2.txt'))).toBe(true)
  }, 180_000)

  test('a route listed in extraRoutes is built like a changes route', async () => {
    const repo = await scratchRepo(['One'])
    const route = {
      agent: 'knowledge',
      skill: 'pikku-knowledge',
      specialist: 'docs',
      refs: [],
      reason: 'knowledge route',
      context: '# Knowledge\n\n## #1 One\n\nwrite it down',
      merged: [],
    }
    const fake = fakeLauncher()
    const h = startRunner(
      repo,
      fake,
      { extraRoutes: ['knowledge'] },
      recordedCommands((args) =>
        args[1] === 'next'
          ? { code: 0, output: JSON.stringify(route) }
          : undefined
      )
    )
    await until('#1 to start', () => fake.agents.length === 1)
    expect(fake.agents[0]!.kind).toBe('build')
    expect(fake.agents[0]!.route?.agent).toBe('knowledge')
    expect(typeof fake.agents[0]!.specialist).toBe('string')
    expect(fake.agents[0]!.prompt).toMatch(/knowledge agent/)
    h.runner.stop()
    await h.done
  }, 120_000)

  test('counters are readable and settable between runs, and a limit message names its option', async () => {
    const repo = await scratchRepo(['One'])
    const fake = fakeLauncher()
    const h = startRunner(repo, fake, { maxTurns: 1 })
    await until('#1 to start', () => fake.agents.length === 1)
    expect(() => (h.runner.counters = { turns: 0 })).toThrow(/no run is going/)
    fake.finish('1', 'quit')
    const first = await h.done
    expect(first.ok).toBe(false)
    expect(first.reason).toMatch(/the limit is 1, set by the maxTurns option/)
    expect(h.runner.counters).toMatchObject({ turns: 1, tries: { '1': 1 } })
    h.runner.counters = { turns: 0 }
    expect(h.runner.counters.turns).toBe(0)
    expect(h.runner.counters.tries).toEqual({ '1': 1 })
    const second = h.runner.run()
    await until('#1 started again', () => fake.started('1').length === 2)
    expect(h.runner.counters.tries).toEqual({ '1': 2 })
    h.runner.stop()
    await second
  }, 120_000)
})
