import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { pikkuHarnessGate, type PikkuHarnessGate } from '@pikku/core/harness'
import {
  HARNESS_RUN,
  runHarness,
  type HarnessAgent,
  type HarnessEvent,
  type HarnessPolicy,
  type RunHarnessOptions,
} from './engine.js'
import { buildHarness } from './build-harness.js'
import { HarnessInfraError, type Finding } from './finding.js'
import { stageOf } from './gate.js'
import { gitIn } from './git.js'
import { oxfmtGate } from './gates/oxfmt.js'
import { parseOxfmtWrite } from './gates/oxfmt-parser.js'
import { parseOxlint } from './gates/oxlint-parser.js'
import { oxlintGate } from './gates/oxlint.js'
import { WorkflowSuspendedException } from '@pikku/core/workflow'
import {
  FAKE_CLI,
  REPO_ROOT,
  removeThrowaways,
  throwawayRepo,
  workflowRun,
} from './test-support.js'

after(removeThrowaways)

const OXLINT = realpathSync(join(REPO_ROOT, 'node_modules/.bin/oxlint'))
const OXFMT = process.env.OXFMT_BIN
/** The tools the runs pin: the real oxlint (and oxfmt when OXFMT_BIN is set) and the fake CLI. */
const tools = {
  oxlint: OXLINT,
  'fake-cli': FAKE_CLI,
  ...(OXFMT ? { oxfmt: OXFMT } : {}),
}
/** What every run gets beside its own options: no services, and the pinned tools. */
const pinned = { services: {}, tools }

/** A throwaway repo on a changeset branch cut from `main`, which the runs judge against. */
const changesetRepo = async (files?: Record<string, string>) => {
  const repo = await throwawayRepo(files)
  await gitIn(repo)(['checkout', '-q', '-b', 'changeset/test'])
  return repo
}

type GateConfig = Parameters<typeof pikkuHarnessGate>[0]

/** Formats src/a.ts by squeezing runs of spaces, through the fake CLI so it is a real child process. */
const fakeFormatter = pikkuHarnessGate({
  name: 'fakefmt',
  description: 'squeezes spaces',
  failOn: 'medium',
  writes: ['**/*.{ts,tsx}'],
  func: async (_services, _data, { gate }) => {
    const source = await readFile(join(gate.worktree, 'src/a.ts'), 'utf8')
    const formatted = source.replace(/ {2,}/g, ' ')
    if (formatted === source) return []
    return gate.runCli(['write', 'src/a.ts', formatted], {
      binary: gate.tool('fake-cli'),
      parse: parseOxfmtWrite,
    })
  },
})
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

/** A read-only gate run in-process that returns what `findings` gives for each call. */
const scriptedGate = (
  name: string,
  findings: (call: number) => Finding[],
  extra: Partial<GateConfig> = {}
) => {
  let calls = 0
  const gate = pikkuHarnessGate({
    name,
    description: name,
    failOn: 'high',
    writes: [],
    func: async () => findings(++calls),
    ...extra,
  })
  return { gate, calls: () => calls }
}

const run = async (
  worktree: string,
  harness: RunHarnessOptions['harness'],
  agent: HarnessAgent,
  extra: Partial<RunHarnessOptions> = {}
) => {
  const events: HarnessEvent[] = []
  let doneCalls = 0
  const run = await workflowRun((workflow) =>
    runHarness({
      worktree,
      base: 'main',
      ...ids,
      ...pinned,
      harness,
      agent,
      workflow,
      onEvent: (event) => events.push(event),
      markDone: async () => {
        doneCalls++
      },
      ...extra,
    })
  )
  return {
    result: await run.output(),
    steps: await run.service.getRunSteps(run.runId),
    events,
    doneCalls: () => doneCalls,
  }
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
    const repo = await changesetRepo({
      ...LINT_CONFIG,
      'src/a.ts': 'export const a = 1\n',
    })
    const { agent, calls } = scriptedAgent(repo, [
      { 'src/a.ts': 'export const a = 1\ndebugger\n' },
      { 'src/a.ts': 'export const a = 2\n' },
    ])
    const { result, doneCalls } = await run(
      repo,
      { name: 'lint', gates: [oxlintGate] },
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
    const repo = await changesetRepo({ 'src/a.ts': 'export const a = 1\n' })
    const { agent } = scriptedAgent(repo, [
      { 'src/a.ts': 'export  const  a  =  2\n' },
    ])
    const seen: string[] = []
    const probe = pikkuHarnessGate({
      name: 'probe',
      description: 'reads the tree the read-only gates see',
      failOn: 'high',
      writes: [],
      func: async (_services, _data, { gate }) => {
        seen.push(await readFile(join(gate.worktree, 'src/a.ts'), 'utf8'))
        return []
      },
    })
    const formatter = OXFMT ? oxfmtGate : fakeFormatter
    const { result } = await run(
      repo,
      { name: 'fmt', gates: [probe, formatter] },
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
    const repo = await changesetRepo({ 'src/a.ts': 'export const a = 1\n' })
    const { agent, calls } = scriptedAgent(repo, [{}])
    const rogue = pikkuHarnessGate({
      name: 'rogue',
      description: 'writes the README',
      failOn: 'medium',
      writes: ['**/*.ts'],
      workflowRetries: 1,
      func: (_services, _data, { gate }) =>
        gate.runCli(['write', 'README.md', 'changed\n'], {
          binary: gate.tool('fake-cli'),
          parse: parseOxfmtWrite,
        }),
    })
    const lint = scriptedGate('later', () => [])
    const { result, events, steps } = await run(
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
      ['infra']
    )
    // Both runs are attempts of one step, failed with the infra error.
    const rogueSteps = steps.filter(
      (step) => step.stepName === 'attempt-1:fixer:rogue'
    )
    assert.deepEqual(
      rogueSteps.map((step) => [step.attemptCount, step.status]),
      [
        [1, 'failed'],
        [2, 'failed'],
      ]
    )
    assert.match(String(rogueSteps[1]!.error?.message), /README\.md/)
  })

  test('the same failing set twice stops as repeated', async () => {
    const repo = await changesetRepo({
      ...LINT_CONFIG,
      'src/a.ts': 'export const a = 1\n',
    })
    const { agent, calls } = scriptedAgent(repo, [
      { 'src/a.ts': 'export const a = 1\ndebugger\n' },
      { 'src/b.ts': 'export const b = 1\n' },
    ])
    const { result, doneCalls } = await run(
      repo,
      { name: 'lint', gates: [oxlintGate] },
      agent,
      { policy: { tries: 5 } }
    )
    assert.equal(result.status, 'repeated')
    assert.equal(result.attempts, 2)
    assert.equal(calls.length, 2)
    assert.equal(result.feedbackHistory.length, 1)
    assert.equal(result.failing?.[0]?.findings[0]?.rule, 'eslint/no-debugger')
    assert.equal(doneCalls(), 0)
  })

  test('a changing failing set keeps going until tries run out', async () => {
    const repo = await changesetRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    const gate = scriptedGate('moving', (call) => [finding(`problem ${call}`)])
    const { result } = await run(
      repo,
      { name: 'moving', gates: [gate.gate] },
      agent,
      { policy: { tries: 3 } }
    )
    assert.equal(result.status, 'gave-up')
    assert.equal(result.attempts, 3)
    assert.equal(calls.length, 3)
    assert.equal(result.feedbackHistory.length, 2)
    assert.match(result.feedbackHistory[1]!, /problem 2/)
  })

  test('unresolved module findings in a lane go back to the builder like any other', async () => {
    const repo = await changesetRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    const check = scriptedGate(
      'check',
      (call) =>
        call === 1
          ? [
              finding(
                "Cannot find module '@pikku/vite' or its corresponding type declarations.",
                { rule: 'pikku/TS2307' }
              ),
            ]
          : [],
      { writes: ['.pikku/**'] }
    )
    const { result } = await run(
      repo,
      { name: 'imports', gates: [check.gate] },
      agent
    )
    assert.equal(result.status, 'done')
    assert.equal(calls.length, 2)
    assert.match(result.feedbackHistory[0]!, /TS2307/)
  })

  test('findings below failOn are notes and the attempt passes', async () => {
    const repo = await changesetRepo()
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

  test('a gate that throws infra once is retried as its step and passes', async () => {
    const repo = await changesetRepo()
    const { agent } = scriptedAgent(repo, [])
    const flaky = scriptedGate(
      'flaky',
      (call) => {
        if (call === 1) throw new HarnessInfraError('timeout', 'slow')
        return []
      },
      { workflowRetries: 1 }
    )
    const { result, events, steps } = await run(
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
      [['attempt-1:gate:flaky', 'ok']]
    )
    assert.deepEqual(
      steps
        .filter((step) => step.stepName === 'attempt-1:gate:flaky')
        .map((step) => [step.attemptCount, step.status, step.error?.message]),
      [
        [1, 'failed', 'slow'],
        [2, 'succeeded', undefined],
      ]
    )
  })

  test('a gate that always throws infra ends the run after its retries', async () => {
    const repo = await changesetRepo()
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
    const repo = await changesetRepo()
    const { agent } = scriptedAgent(repo, [])
    const slow = pikkuHarnessGate({
      name: 'slow',
      description: 'never answers in time',
      failOn: 'high',
      workflowTimeout: '50ms',
      func: () => new Promise((done) => setTimeout(() => done([]), 1_000)),
    })
    const { result } = await run(repo, { name: 'slow', gates: [slow] }, agent)
    assert.equal(result.status, 'infra')
    assert.equal(result.infra?.kind, 'timeout')
  })

  test('a gate past its workflowTimeout has its tool stopped', async () => {
    const repo = await changesetRepo()
    const { agent } = scriptedAgent(repo, [])
    const late = join(repo, '.pikku/late.txt')
    let signal: AbortSignal | undefined
    const slow = pikkuHarnessGate({
      name: 'slow-tool',
      description: 'writes a file if it is left running',
      failOn: 'high',
      workflowTimeout: '200ms',
      func: async (_services, _data, { gate }) => {
        signal = gate.signal
        await mkdir(join(gate.worktree, '.pikku'), { recursive: true })
        return gate.runCli(['write-later', late, '1500'], {
          binary: gate.tool('fake-cli'),
          parse: parseOxlint,
        })
      },
    })
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

  test('a stop while a gate runs stops its tool and ends the run as aborted infra, without markDone', async () => {
    const repo = await changesetRepo()
    const { agent } = scriptedAgent(repo, [])
    const late = join(repo, '.pikku/late.txt')
    const stop = new AbortController()
    const slow = pikkuHarnessGate({
      name: 'slow-tool',
      description: 'writes a file if it is left running',
      failOn: 'high',
      func: async (_services, _data, { gate }) => {
        await mkdir(join(gate.worktree, '.pikku'), { recursive: true })
        setTimeout(() => stop.abort(), 100)
        return gate.runCli(['write-later', late, '1500'], {
          binary: gate.tool('fake-cli'),
          parse: parseOxlint,
        })
      },
    })
    const started = Date.now()
    const { result, doneCalls } = await run(
      repo,
      { name: 'slow', gates: [slow] },
      agent,
      { signal: stop.signal }
    )
    assert.equal(result.status, 'infra')
    assert.equal(result.infra?.kind, 'aborted')
    assert.equal(result.infra?.gate, 'slow-tool')
    assert.equal(doneCalls(), 0)
    assert.ok(Date.now() - started < 1_400, `${Date.now() - started} ms`)
    await new Promise((done) =>
      setTimeout(done, 2_000 - (Date.now() - started))
    )
    await assert.rejects(access(late))
  })

  test('uncommitted work goes back to the agent without running the gates', async () => {
    const repo = await changesetRepo({ 'src/a.ts': 'export const a = 1\n' })
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
    const repo = await changesetRepo()
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
    const repo = await changesetRepo()
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
    const repo = await changesetRepo()
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
      { name: 'noisy', gates: [gate.gate] },
      agent,
      { policy: { feedbackMaxChars: maxChars } }
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
    const repo = await changesetRepo({ 'src/a.ts': 'export const a = 1\n' })
    const { agent } = scriptedAgent(repo, [
      { 'src/a.ts': 'export  const a = 2\n' },
    ])
    const check = scriptedGate(
      'typecheck',
      (call) => (call === 1 ? [finding('type error')] : []),
      { writes: ['.pikku/**'] }
    )
    const lint = scriptedGate('lint', () => [])
    const { result, steps, events } = await run(
      repo,
      {
        name: 'all',
        gates: [lint.gate, fakeFormatter, check.gate],
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
      steps.map(({ stepName }) => stepName),
      expected.flatMap(([name]) =>
        snapshots[name as string] ? [snapshots[name as string], name] : [name]
      )
    )
    for (const event of events)
      assert.ok(Number.isInteger(event.durationMs) && event.durationMs >= 0)
  })
})

describe('the build harness', () => {
  test('lists its gates by reference, and their writes put them in their stages', () => {
    assert.deepEqual(
      buildHarness.gates.map((gate) => {
        const declared = gate as PikkuHarnessGate
        return [declared.name, stageOf(declared)]
      }),
      [
        ['check', 'check'],
        ['oxfmt', 'fixer'],
        ['oxlint', 'gate'],
        ['trailers', 'gate'],
        ['migrations', 'gate'],
        ['plan', 'gate'],
        ['pages', 'check'],
        ['hand-typed-tables', 'gate'],
      ]
    )
  })

  test('a gate listed by name cannot be run: the engine runs what it is handed', async () => {
    const repo = await changesetRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    await assert.rejects(
      run(repo, { name: 'named', gates: ['oxlint'] }, agent),
      /Harness named lists oxlint by name, with an override or as a gate agent; the engine runs gates listed by reference/
    )
    assert.equal(calls.length, 0)
  })
})

/** The reasons of the approvals the run waits on. */
const pendingWaivers = async (
  service: Awaited<ReturnType<typeof workflowRun>>['service'],
  runId: string
) =>
  (await service.getRunSteps(runId))
    .filter((step) => step.status === 'running')
    .map((step) => step.stepName.replace(/^__workflow_approval:/, ''))

describe('runHarness in a harness run', () => {
  test('tries defaults to 2', async () => {
    const repo = await changesetRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    const gate = scriptedGate('moving', (call) => [finding(`problem ${call}`)])
    const { result } = await run(
      repo,
      { name: 'two', gates: [gate.gate] },
      agent
    )
    assert.equal(result.status, 'gave-up')
    assert.equal(result.attempts, 2)
    assert.equal(calls.length, 2)
  })

  test('a run not started with the harness wire is refused before the agent runs', async () => {
    const repo = await changesetRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    await assert.rejects(
      workflowRun(
        (workflow) =>
          runHarness({
            worktree: repo,
            base: 'main',
            ...ids,
            ...pinned,
            harness: { name: 'plain', gates: [] },
            agent,
            workflow,
            markDone: async () => {},
          }),
        { type: 'http' }
      ),
      /runs only in a harness run: start the workflow with the wire \{ type: 'harness' \}, not 'http'/
    )
    assert.equal(calls.length, 0)
  })

  /** A gate whose first run fails on findings a person may waive; later runs pass. */
  const phoneGate = () =>
    scriptedGate(
      'pages',
      (call) =>
        call === 1
          ? [
              finding('/about at 390 px differs\nmore', { rule: 'test/phone' }),
              finding('/ at 390 px differs', { rule: 'test/phone' }),
            ]
          : [],
      { waivable: ['test/phone'] }
    )

  const waiverRun = async (
    gates: PikkuHarnessGate[],
    policy?: HarnessPolicy
  ) => {
    const repo = await changesetRepo()
    const { agent, calls } = scriptedAgent(repo, [])
    let doneCalls = 0
    const run = await workflowRun(
      (workflow) =>
        runHarness({
          worktree: repo,
          base: 'main',
          ...ids,
          ...pinned,
          harness: { name: 'waive', gates },
          ...(policy ? { policy } : {}),
          agent,
          workflow,
          markDone: async () => {
            doneCalls++
          },
        }),
      { type: HARNESS_RUN, pikkuUserId: 'starter' }
    )
    return { run, calls, doneCalls: () => doneCalls }
  }

  test('waivable findings that are all that fails wait on a person; waived, they are notes and the run is done', async () => {
    const pages = phoneGate()
    const { run, calls, doneCalls } = await waiverRun([pages.gate])
    assert.equal((await run.run()).status, 'suspended')
    const reasons = await pendingWaivers(run.service, run.runId)
    assert.deepEqual(reasons, [
      'attempt-1:waive:pages:1: /about at 390 px differs',
      'attempt-1:waive:pages:2: / at 390 px differs',
    ])
    for (const reason of reasons)
      await run.service.approveStep(run.runId, reason, { waive: true }, {
        userId: 'reviewer',
      } as never)
    await run.replay()
    const result = await run.output()
    assert.equal(result.status, 'done')
    assert.equal(result.attempts, 1)
    assert.deepEqual(result.feedbackHistory, [])
    assert.deepEqual(
      result.notes.map(({ gate, finding }) => [gate, finding.rule]),
      [
        ['pages', 'test/phone'],
        ['pages', 'test/phone'],
      ]
    )
    assert.equal(calls.length, 1)
    assert.equal(pages.calls(), 1)
    assert.equal(doneCalls(), 1)
  })

  test('only a signed-in person who did not start the run can waive; the builder cannot', async () => {
    const { run } = await waiverRun([phoneGate().gate])
    const [reason] = await pendingWaivers(run.service, run.runId)
    await assert.rejects(
      run.service.approveStep(run.runId, reason!, { waive: true }),
      /requires a signed-in user/
    )
    await assert.rejects(
      run.service.approveStep(run.runId, reason!, { waive: true }, {
        userId: 'starter',
      } as never),
      /started this run may not answer/
    )
  })

  test('a refused waiver keeps its finding failing, and it goes to the builder', async () => {
    const pages = phoneGate()
    const { run, calls } = await waiverRun([pages.gate])
    const reasons = await pendingWaivers(run.service, run.runId)
    await run.service.approveStep(run.runId, reasons[0]!, { waive: true }, {
      userId: 'reviewer',
    } as never)
    await run.service.approveStep(run.runId, reasons[1]!, { waive: false }, {
      userId: 'reviewer',
    } as never)
    await run.replay()
    const result = await run.output()
    assert.equal(result.status, 'done')
    assert.equal(result.attempts, 2)
    assert.equal(calls.length, 2)
    assert.match(result.feedbackHistory[0]!, /\/ at 390 px differs/)
    assert.doesNotMatch(result.feedbackHistory[0]!, /\/about/)
    assert.deepEqual(
      result.notes.map(({ finding }) => finding.message.split('\n')[0]),
      ['/about at 390 px differs']
    )
  })

  test('an expired waiver keeps its finding failing', async () => {
    const { run, calls } = await waiverRun([phoneGate().gate], {
      waive: { approvers: 'not-initiator', expiry: 200 },
    })
    assert.equal((await run.run()).status, 'suspended')
    await new Promise((done) => setTimeout(done, 300))
    await run.replay()
    const result = await run.output()
    assert.equal(result.status, 'done')
    assert.equal(result.attempts, 2)
    assert.equal(calls.length, 2)
    assert.match(result.feedbackHistory[0]!, /\/about at 390 px differs/)
    assert.deepEqual(result.notes, [])
  })

  test('no waiver is asked while another finding fails the attempt', async () => {
    const other = scriptedGate('lint', (call) =>
      call === 1 ? [finding('real problem')] : []
    )
    const { run, calls } = await waiverRun([phoneGate().gate, other.gate])
    const result = await run.output()
    assert.equal(result.status, 'done')
    assert.equal(result.attempts, 2)
    assert.equal(calls.length, 2)
    assert.match(result.feedbackHistory[0]!, /real problem/)
    assert.match(result.feedbackHistory[0]!, /\/about at 390 px differs/)
    assert.deepEqual(await pendingWaivers(run.service, run.runId), [])
  })

  test("each tool a gate runs records its duration and exit code in the run's analytics", async () => {
    const repo = await changesetRepo({ 'src/a.ts': 'export  const a = 1\n' })
    const recorded: Record<string, unknown>[] = []
    const { result } = await run(
      repo,
      { name: 'cli', gates: [fakeFormatter] },
      scriptedAgent(repo, []).agent,
      {
        analytics: {
          record: async (event) => {
            recorded.push(event)
          },
        },
      }
    )
    assert.equal(result.status, 'done')
    assert.equal(recorded.length, 1)
    const [event] = recorded
    assert.deepEqual(
      { ...event, durationMs: undefined },
      {
        name: 'harness.cli',
        gate: 'fakefmt',
        attempt: 1,
        exitCode: 0,
        durationMs: undefined,
      }
    )
    assert.ok(Number.isInteger(event!.durationMs))
  })
})

/** Writes the attempt's file and commits it, unless that attempt's commit is already in. */
const idempotentAgent =
  (repo: string): HarnessAgent =>
  async ({ attempt }) => {
    const git = gitIn(repo)
    const subject = `feat: #k3x9 attempt ${attempt}`
    if ((await git(['log', '--format=%s'])).split('\n').includes(subject))
      return { outcome: 'done' }
    await writeFile(
      join(repo, 'src/a.ts'),
      attempt === 1
        ? 'export  const  a  =  1\ndebugger\n'
        : 'export const a = 2\n'
    )
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', subject])
    return { outcome: 'done' }
  }

/**
 * Runs the harness to its end. With `killAt`, that step's work is done and then the pass dies
 * before its result is stored (the run is left suspended), and the run is replayed.
 */
const runDurably = async (killAt?: string) => {
  const repo = await changesetRepo({
    ...LINT_CONFIG,
    'src/a.ts': 'export const a = 0\n',
  })
  let doneCalls = 0
  let killed = false
  const run = await workflowRun((workflow) =>
    runHarness({
      worktree: repo,
      base: 'main',
      ...ids,
      ...pinned,
      harness: {
        name: 'durable',
        gates: [oxlintGate, fakeFormatter],
      },
      agent: idempotentAgent(repo),
      workflow: {
        ...workflow,
        do: ((name: string, fn: () => Promise<unknown>, options: object) =>
          workflow.do(
            name,
            async () => {
              const result = await fn()
              if (name === killAt && !killed) {
                killed = true
                throw new WorkflowSuspendedException(workflow.runId, 'killed')
              }
              return result
            },
            options
          )) as typeof workflow.do,
      },
      markDone: async () => {
        doneCalls++
      },
    })
  )
  assert.equal(killed, killAt !== undefined, `${killAt} was never reached`)
  if (killAt) {
    assert.equal((await run.run()).status, 'suspended')
    await run.replay()
  }
  const log = (await gitIn(repo)(['log', '--format=%T %s%n%b%x00'])).trim()
  return { result: await run.output(), log, doneCalls }
}

describe('runHarness replayed', () => {
  test('a pass killed mid-step replays to the same result and the same commits', async () => {
    const baseline = await runDurably()
    assert.equal(baseline.result.status, 'done')
    assert.equal(baseline.result.attempts, 2)
    assert.equal(baseline.doneCalls, 1)
    assert.match(
      baseline.log,
      /style\(fakefmt\): #k3x9 apply fakefmt fixes \(attempt 1\)/
    )
    for (const killAt of [
      'attempt-1:fixer:fakefmt',
      'attempt-1:commit:fakefmt',
      'attempt-1:gate:oxlint',
      'attempt-2:agent',
      'markDone',
    ]) {
      const killed = await runDurably(killAt)
      assert.deepEqual(killed.result, baseline.result, killAt)
      assert.equal(killed.log, baseline.log, killAt)
      assert.equal(
        killed.doneCalls,
        killAt === 'markDone' ? 2 : 1,
        `${killAt}: markDone calls`
      )
    }
  })
})
