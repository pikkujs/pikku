import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import {
  runHarness,
  type Harness,
  type HarnessAgent,
  type HarnessEvent,
  type RunHarnessOptions,
} from './engine.js'
import { HarnessInfraError, type Finding } from './finding.js'
import type { HarnessGate } from './gate.js'
import { gitIn } from './git.js'
import { oxfmtGate } from './gates/oxfmt.js'
import { parseOxfmtWrite } from './gates/oxfmt-parser.js'
import { parseOxlint } from './gates/oxlint-parser.js'
import { oxlintGate } from './gates/oxlint.js'
import { InMemorySteps } from './steps.js'
import {
  FAKE_CLI,
  REPO_ROOT,
  fakeFormatter,
  removeThrowaways,
  throwawayRepo,
} from './test-support.js'

after(removeThrowaways)

const OXLINT = realpathSync(join(REPO_ROOT, 'node_modules/.bin/oxlint'))
const OXFMT = process.env.OXFMT_BIN
const ids = { shortId: 'k3x9', changeId: 'chg_0123456789', changeset: 'cs_abc' }
const LINT_CONFIG = { '.oxlintrc.json': '{"rules":{"no-debugger":"error"}}' }

type Edits = Record<string, string>

/** An agent that writes the given files on each turn and commits them, as a builder would. */
const scriptedAgent = (worktree: string, turns: Edits[]) => {
  const calls: { attempt: number; feedback?: string }[] = []
  const agent: HarnessAgent = async (input) => {
    calls.push(input)
    const edits = turns[input.attempt - 1] ?? {}
    for (const [path, content] of Object.entries(edits))
      await writeFile(join(worktree, path), content)
    if (Object.keys(edits).length) {
      const git = gitIn(worktree)
      await git(['add', '-A'])
      await git(['commit', '-q', '-m', `feat: #k3x9 attempt ${input.attempt}`])
    }
    return { outcome: 'done' }
  }
  return { agent, calls }
}

/** A gate run in-process that returns what `findings` gives for each call. */
const scriptedGate = (
  name: string,
  findings: (call: number) => Finding[],
  extra: Partial<HarnessGate> = {}
) => {
  let calls = 0
  const gate: HarnessGate = {
    name,
    description: name,
    failOn: 'high',
    run: async () => findings(++calls),
    ...extra,
  }
  return { gate, calls: () => calls }
}

const run = async (
  worktree: string,
  harness: Harness,
  agent: HarnessAgent,
  extra: Partial<RunHarnessOptions> = {}
) => {
  const steps = new InMemorySteps()
  const events: HarnessEvent[] = []
  let doneCalls = 0
  const result = await runHarness({
    worktree,
    base: 'main',
    ...ids,
    harness,
    agent,
    steps,
    onEvent: (event) => events.push(event),
    markDone: async () => {
      doneCalls++
    },
    ...extra,
  })
  return { result, steps, events, doneCalls: () => doneCalls }
}

const finding = (message: string, extra: Partial<Finding> = {}): Finding => ({
  file: 'src/a.ts',
  line: 1,
  severity: 'high',
  rule: 'test/rule',
  message,
  ...extra,
})

describe('runHarness', () => {
  test('a lint error goes back to the agent; the clean second attempt is done', async () => {
    const repo = await throwawayRepo({
      ...LINT_CONFIG,
      'src/a.ts': 'export const a = 1\n',
    })
    const { agent, calls } = scriptedAgent(repo, [
      { 'src/a.ts': 'export const a = 1\ndebugger\n' },
      { 'src/a.ts': 'export const a = 2\n' },
    ])
    const { result, doneCalls } = await run(
      repo,
      { name: 'lint', gates: [oxlintGate({ binary: OXLINT })] },
      agent
    )
    assert.equal(result.status, 'done')
    assert.equal(result.attempts, 2)
    assert.equal(doneCalls(), 1)
    assert.equal(calls.length, 2)
    assert.equal(calls[0]!.feedback, undefined)
    assert.equal(calls[1]!.feedback, result.feedbackHistory[0])
    assert.equal(result.feedbackHistory.length, 1)
    assert.match(
      result.feedbackHistory[0]!,
      /^Attempt 1 did not pass the gates\. Fix these findings:\n\noxlint \(1\):\n- src\/a\.ts:2 \[high\] eslint\/no-debugger: `debugger` statement is not allowed/
    )
  })

  test('a fixer gets its own commit with trailers and the read-only gates see the formatted tree', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'export const a = 1\n' })
    const { agent } = scriptedAgent(repo, [
      { 'src/a.ts': 'export  const  a  =  2\n' },
    ])
    const seen: string[] = []
    const probe = scriptedGate('probe', () => [])
    probe.gate.run = async (wire) => {
      seen.push(await readFile(join(wire.worktree, 'src/a.ts'), 'utf8'))
      return []
    }
    const formatter = OXFMT
      ? oxfmtGate({ binary: OXFMT })
      : fakeFormatter('src/a.ts')
    const { result } = await run(
      repo,
      { name: 'fmt', gates: [probe.gate, formatter] },
      agent
    )
    assert.equal(result.status, 'done')
    const formatted = OXFMT ? 'export const a = 2;\n' : 'export const a = 2\n'
    assert.deepEqual(seen, [formatted])
    const git = gitIn(repo)
    const [fix, feat] = (await git(['log', '-2', '--format=%B%x00']))
      .split('\0\n')
      .filter(Boolean)
    assert.equal(
      fix,
      `style(${formatter.name}): #k3x9 apply ${formatter.name} fixes (attempt 1)\n\nChange-Id: chg_0123456789\nChangeset: cs_abc\n`
    )
    assert.match(feat!, /^feat: #k3x9 attempt 1/)
    assert.equal(
      (await git(['show', '--name-only', '--format=', 'HEAD'])).trim(),
      'src/a.ts'
    )
    assert.equal(await git(['status', '--porcelain', '-uall']), '')
  })

  test('a fixer that writes outside its allowlist is infra and the agent never hears of it', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'export const a = 1\n' })
    const { agent, calls } = scriptedAgent(repo, [{}])
    const rogue: HarnessGate = {
      name: 'rogue',
      description: 'writes the README',
      stage: 'fixer',
      failOn: 'medium',
      writes: ['**/*.ts'],
      workflowRetries: 1,
      run: (wire) =>
        wire.runCli(['write', 'README.md', 'changed\n'], {
          binary: FAKE_CLI,
          parse: parseOxfmtWrite,
        }),
    }
    const lint = scriptedGate('later', () => [])
    const { result, events } = await run(
      repo,
      { name: 'rogue', gates: [rogue, lint.gate] },
      agent
    )
    assert.equal(result.status, 'infra')
    assert.equal(result.infra?.gate, 'rogue')
    assert.equal(result.infra?.kind, 'write-outside-allowlist')
    assert.match(result.infra!.message, /README\.md/)
    assert.equal(calls.length, 1)
    assert.deepEqual(result.feedbackHistory, [])
    assert.equal(lint.calls(), 0)
    assert.deepEqual(
      events.filter((event) => event.gate === 'rogue').map((e) => e.status),
      ['infra', 'infra']
    )
  })

  test('the same failing set twice stops as repeated', async () => {
    const repo = await throwawayRepo({
      ...LINT_CONFIG,
      'src/a.ts': 'export const a = 1\n',
    })
    const { agent, calls } = scriptedAgent(repo, [
      { 'src/a.ts': 'export const a = 1\ndebugger\n' },
      { 'src/b.ts': 'export const b = 1\n' },
    ])
    const { result, doneCalls } = await run(
      repo,
      {
        name: 'lint',
        gates: [oxlintGate({ binary: OXLINT })],
        policy: { tries: 5 },
      },
      agent
    )
    assert.equal(result.status, 'repeated')
    assert.equal(result.attempts, 2)
    assert.equal(calls.length, 2)
    assert.equal(result.feedbackHistory.length, 1)
    assert.equal(result.failing?.[0]?.findings[0]?.rule, 'eslint/no-debugger')
    assert.equal(doneCalls(), 0)
  })

  test('a changing failing set keeps going until tries run out', async () => {
    const repo = await throwawayRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    const gate = scriptedGate('moving', (call) => [finding(`problem ${call}`)])
    const { result } = await run(
      repo,
      { name: 'moving', gates: [gate.gate], policy: { tries: 3 } },
      agent
    )
    assert.equal(result.status, 'gave-up')
    assert.equal(result.attempts, 3)
    assert.equal(calls.length, 3)
    assert.equal(result.feedbackHistory.length, 2)
    assert.match(result.feedbackHistory[1]!, /problem 2/)
  })

  test('findings below failOn are notes and the attempt passes', async () => {
    const repo = await throwawayRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    const gate = scriptedGate('advisory', () => [
      finding('consider this', { severity: 'medium' }),
    ])
    const { result, doneCalls } = await run(
      repo,
      { name: 'advisory', gates: [gate.gate] },
      agent
    )
    assert.equal(result.status, 'done')
    assert.equal(doneCalls(), 1)
    assert.equal(calls.length, 1)
    assert.deepEqual(result.feedbackHistory, [])
    assert.deepEqual(result.notes, [
      {
        gate: 'advisory',
        attempt: 1,
        finding: finding('consider this', { severity: 'medium' }),
      },
    ])
  })

  test('a gate that throws infra once is retried and passes', async () => {
    const repo = await throwawayRepo()
    const { agent } = scriptedAgent(repo, [])
    const flaky = scriptedGate(
      'flaky',
      (call) => {
        if (call === 1) throw new HarnessInfraError('timeout', 'slow')
        return []
      },
      { workflowRetries: 1 }
    )
    const { result, events } = await run(
      repo,
      { name: 'flaky', gates: [flaky.gate] },
      agent
    )
    assert.equal(result.status, 'done')
    assert.equal(flaky.calls(), 2)
    assert.deepEqual(
      events
        .filter((event) => event.gate === 'flaky')
        .map(({ name, status }) => [name, status]),
      [
        ['attempt-1:gate:flaky', 'infra'],
        ['attempt-1:gate:flaky:try-2', 'ok'],
      ]
    )
  })

  test('a gate that always throws infra ends the run after its retries', async () => {
    const repo = await throwawayRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    const broken = scriptedGate(
      'broken',
      () => {
        throw new HarnessInfraError('missing-binary', 'no tool')
      },
      { workflowRetries: 2 }
    )
    const healthy = scriptedGate('healthy', () => [finding('bad')])
    const { result, doneCalls } = await run(
      repo,
      { name: 'broken', gates: [broken.gate, healthy.gate] },
      agent
    )
    assert.equal(result.status, 'infra')
    assert.deepEqual(result.infra, {
      gate: 'broken',
      kind: 'missing-binary',
      message: 'no tool',
    })
    assert.equal(broken.calls(), 3)
    assert.equal(calls.length, 1)
    assert.deepEqual(result.feedbackHistory, [])
    assert.equal(doneCalls(), 0)
  })

  test('a gate past its workflowTimeout is infra', async () => {
    const repo = await throwawayRepo()
    const { agent } = scriptedAgent(repo, [])
    const slow: HarnessGate = {
      name: 'slow',
      description: 'never answers in time',
      failOn: 'high',
      workflowTimeout: '50ms',
      run: () => new Promise((done) => setTimeout(() => done([]), 1_000)),
    }
    const { result } = await run(repo, { name: 'slow', gates: [slow] }, agent)
    assert.equal(result.status, 'infra')
    assert.equal(result.infra?.kind, 'timeout')
  })

  test('a gate past its workflowTimeout has its tool stopped', async () => {
    const repo = await throwawayRepo()
    const { agent } = scriptedAgent(repo, [])
    const late = join(repo, '.pikku/late.txt')
    let signal: AbortSignal | undefined
    const slow: HarnessGate = {
      name: 'slow-tool',
      description: 'writes a file if it is left running',
      failOn: 'high',
      workflowTimeout: '200ms',
      run: async (wire) => {
        signal = wire.signal
        await mkdir(join(wire.worktree, '.pikku'), { recursive: true })
        return wire.runCli(['write-later', late, '1500'], {
          binary: FAKE_CLI,
          parse: parseOxlint,
        })
      },
    }
    const started = Date.now()
    const { result } = await run(repo, { name: 'slow', gates: [slow] }, agent)
    assert.equal(result.status, 'infra')
    assert.equal(result.infra?.kind, 'timeout')
    assert.equal(signal?.aborted, true)
    // the run waited for the tool to stop, and stopping it took far less than the tool's 1500 ms
    assert.ok(Date.now() - started < 1_400, `${Date.now() - started} ms`)
    await new Promise((done) =>
      setTimeout(done, 2_000 - (Date.now() - started))
    )
    await assert.rejects(access(late))
  })

  test('uncommitted work goes back to the agent without running the gates', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'export const a = 1\n' })
    const gate = scriptedGate('lint', () => [])
    const calls: { attempt: number; feedback?: string }[] = []
    const agent: HarnessAgent = async (input) => {
      calls.push(input)
      await mkdir(join(repo, '.pikku'), { recursive: true })
      await writeFile(join(repo, '.pikku/state.json'), `${input.attempt}\n`)
      if (input.attempt === 1) {
        await writeFile(join(repo, 'src/a.ts'), 'export const a = 2\n')
        await writeFile(join(repo, 'src/new.ts'), 'export const b = 1\n')
      } else {
        const git = gitIn(repo)
        await git(['add', 'src'])
        await git(['commit', '-q', '-m', 'feat: #k3x9 commit the work'])
      }
      return { outcome: 'done' }
    }
    const { result, events } = await run(
      repo,
      { name: 'clean', gates: [gate.gate] },
      agent
    )
    assert.equal(result.status, 'done')
    assert.equal(result.attempts, 2)
    assert.equal(gate.calls(), 1)
    assert.equal(
      calls[1]!.feedback,
      'Attempt 1 did not pass the gates. Fix these findings:\n\n' +
        'clean-tree (2):\n' +
        '- src/a.ts [high] harness/uncommitted: uncommitted changes: commit them\n' +
        '- src/new.ts [high] harness/uncommitted: uncommitted changes: commit them'
    )
    assert.deepEqual(
      events.map(({ name, status }) => [name, status]),
      [
        ['attempt-1:agent', 'ok'],
        ['attempt-1:clean-tree', 'fail'],
        ['attempt-2:agent', 'ok'],
        ['attempt-2:clean-tree', 'ok'],
        ['attempt-2:gate:lint', 'ok'],
        ['markDone', 'ok'],
      ]
    )
  })

  test('an agent that never commits stops as repeated', async () => {
    const repo = await throwawayRepo()
    const gate = scriptedGate('lint', () => [])
    const agent: HarnessAgent = async () => {
      await writeFile(join(repo, 'loose.ts'), 'export const x = 1\n')
      return { outcome: 'done' }
    }
    const { result, doneCalls } = await run(
      repo,
      { name: 'clean', gates: [gate.gate] },
      agent
    )
    assert.equal(result.status, 'repeated')
    assert.equal(result.attempts, 2)
    assert.equal(result.failing?.[0]?.gate, 'clean-tree')
    assert.equal(gate.calls(), 0)
    assert.equal(doneCalls(), 0)
  })

  test('needs-answer ends the run without running gates', async () => {
    const repo = await throwawayRepo()
    const gate = scriptedGate('unused', () => [])
    const { result, events, doneCalls } = await run(
      repo,
      { name: 'ask', gates: [gate.gate] },
      async () => ({ outcome: 'needs-answer' })
    )
    assert.equal(result.status, 'needs-answer')
    assert.equal(result.attempts, 1)
    assert.equal(gate.calls(), 0)
    assert.equal(doneCalls(), 0)
    assert.deepEqual(
      events.map(({ name, status }) => [name, status]),
      [['attempt-1:agent', 'needs-answer']]
    )
  })

  test('feedback is trimmed whole-finding and a secret never reaches the agent', async () => {
    const repo = await throwawayRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    // built at runtime so the repository holds no secret-shaped literal
    const secret = ['AK', 'IA', 'FAKE', 'FAKE', 'FAKE', 'FAKE'].join('')
    const many = Array.from({ length: 40 }, (_, i) =>
      finding(`finding number ${i} ${'x'.repeat(40)}`, { line: i + 1 })
    )
    const gate = scriptedGate('noisy', (call) =>
      call === 1 ? [finding(`leaked ${secret} here`), ...many] : []
    )
    const maxChars = 600
    const { result } = await run(
      repo,
      {
        name: 'noisy',
        gates: [gate.gate],
        policy: { feedbackMaxChars: maxChars },
      },
      agent
    )
    assert.equal(result.status, 'done')
    const feedback = calls[1]!.feedback!
    assert.ok(feedback.length <= maxChars, `${feedback.length} > ${maxChars}`)
    assert.ok(!feedback.includes(secret))
    assert.match(feedback, /leaked \[REDACTED\] here/)
    assert.match(feedback, /… \d+ more finding\(s\) not shown/)
    const items = feedback.split('\n').filter((line) => line.startsWith('- '))
    assert.ok(items.length > 1)
    for (const item of items.slice(1))
      assert.match(
        item,
        /^- src\/a\.ts:\d+ \[high\] test\/rule: finding number \d+ x{40}$/
      )
  })

  test('every step is one named step with an event', async () => {
    const repo = await throwawayRepo({ 'src/a.ts': 'export const a = 1\n' })
    const { agent } = scriptedAgent(repo, [
      { 'src/a.ts': 'export  const a = 2\n' },
    ])
    const check = scriptedGate(
      'typecheck',
      (call) => (call === 1 ? [finding('type error')] : []),
      { stage: 'check' }
    )
    const lint = scriptedGate('lint', () => [])
    const { result, steps, events } = await run(
      repo,
      {
        name: 'all',
        gates: [lint.gate, fakeFormatter('src/a.ts'), check.gate],
      },
      agent
    )
    assert.equal(result.status, 'done')
    const expected = [
      ['attempt-1:agent', undefined, 1, 'ok'],
      ['attempt-1:clean-tree', undefined, 1, 'ok'],
      ['attempt-1:check:typecheck', 'typecheck', 1, 'fail'],
      ['attempt-1:fixer:fakefmt', 'fakefmt', 1, 'ok'],
      ['attempt-1:commit:fakefmt', 'fakefmt', 1, 'ok'],
      ['attempt-1:gate:lint', 'lint', 1, 'ok'],
      ['attempt-2:agent', undefined, 2, 'ok'],
      ['attempt-2:clean-tree', undefined, 2, 'ok'],
      ['attempt-2:check:typecheck', 'typecheck', 2, 'ok'],
      ['attempt-2:fixer:fakefmt', 'fakefmt', 2, 'ok'],
      ['attempt-2:gate:lint', 'lint', 2, 'ok'],
      ['markDone', undefined, 2, 'ok'],
    ]
    assert.deepEqual(
      events.map(({ name, gate, attempt, status }) => [
        name,
        gate,
        attempt,
        status,
      ]),
      expected
    )
    // Each stage's write-guard snapshot is a step of its own, with no event.
    const snapshots: Record<string, string> = {
      'attempt-1:check:typecheck': 'attempt-1:snapshot:check:typecheck',
      'attempt-1:fixer:fakefmt': 'attempt-1:snapshot:fixer:fakefmt',
      'attempt-1:gate:lint': 'attempt-1:snapshot:gate',
      'attempt-2:check:typecheck': 'attempt-2:snapshot:check:typecheck',
      'attempt-2:fixer:fakefmt': 'attempt-2:snapshot:fixer:fakefmt',
      'attempt-2:gate:lint': 'attempt-2:snapshot:gate',
    }
    assert.deepEqual(
      steps.records.map(({ name }) => name),
      expected.flatMap(([name]) =>
        snapshots[name as string] ? [snapshots[name as string], name] : [name]
      )
    )
    for (const event of events)
      assert.ok(Number.isInteger(event.durationMs) && event.durationMs >= 0)
  })
})
