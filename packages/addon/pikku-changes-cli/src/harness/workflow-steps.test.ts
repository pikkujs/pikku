import assert from 'node:assert/strict'
import { realpathSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { runHarness, type HarnessAgent, type HarnessResult } from './engine.js'
import { HarnessInfraError } from './finding.js'
import { gitIn } from './git.js'
import { oxlintGate } from './gates/oxlint.js'
import {
  REPO_ROOT,
  fakeFormatter,
  removeThrowaways,
  throwawayRepo,
} from './test-support.js'
import { workflowSteps, type WorkflowDo } from './workflow-steps.js'

after(removeThrowaways)

class Killed extends Error {}

/**
 * A workflow `do` that keeps each step's result as JSON, the way a database does. With `killAt`,
 * that step's work runs and the process "dies" before the result is stored.
 */
const durableDo = (store: Map<string, string>, killAt?: string) => {
  const ran: string[] = []
  const options: unknown[] = []
  const workflow: WorkflowDo = {
    do: async (name, fn, stepOptions) => {
      options.push(stepOptions)
      const stored = store.get(name)
      if (stored !== undefined) return JSON.parse(stored)
      ran.push(name)
      const result = await fn()
      if (name === killAt) throw new Killed(name)
      store.set(name, JSON.stringify(result))
      return JSON.parse(store.get(name)!)
    },
  }
  return { workflow, ran, options }
}

describe('workflowSteps', () => {
  test('a result is stored as JSON and not run again on replay', async () => {
    const store = new Map<string, string>()
    let runs = 0
    const first = durableDo(store)
    const value = await workflowSteps(first.workflow).step('s', async () => {
      runs++
      return { findings: [{ severity: 'high', message: 'm' }], changed: [] }
    })
    const again = await workflowSteps(durableDo(store).workflow).step(
      's',
      async () => {
        runs++
        return { findings: [], changed: [] }
      }
    )
    assert.deepEqual(again, value)
    assert.equal(runs, 1)
    assert.deepEqual(first.options, [{ retries: 0 }])
  })

  test('a thrown infra error is stored and thrown again on replay without running the step', async () => {
    const store = new Map<string, string>()
    let runs = 0
    const fail = async () => {
      runs++
      throw new HarnessInfraError('timeout', 'too slow', { exitCode: 3 })
    }
    for (const _ of [1, 2])
      await assert.rejects(
        workflowSteps(durableDo(store).workflow).step('s', fail),
        (error) =>
          error instanceof HarnessInfraError &&
          error.kind === 'timeout' &&
          error.message === 'too slow' &&
          error.exitCode === 3
      )
    assert.equal(runs, 1)
  })

  test('a plain error comes back as an Error with its name and message', async () => {
    const store = new Map<string, string>()
    const step = () =>
      workflowSteps(durableDo(store).workflow).step('s', async () => {
        throw new TypeError('bad')
      })
    for (const _ of [1, 2])
      await assert.rejects(step(), (error) => {
        assert.ok(
          error instanceof Error && !(error instanceof HarnessInfraError)
        )
        assert.equal((error as Error).name, 'TypeError')
        assert.equal((error as Error).message, 'bad')
        return true
      })
  })

  test('a result that is not plain JSON is refused', async () => {
    const steps = workflowSteps(durableDo(new Map()).workflow)
    await assert.rejects(
      steps.step('map', async () => new Map([['a', 'b']])),
      /result is not plain JSON \(Map\)/
    )
    await assert.rejects(
      steps.step('nested', async () => ({ at: [new Date(0)] })),
      /result\.at\[0\] is not plain JSON \(Date\)/
    )
    assert.equal(await steps.step('void', async () => undefined), undefined)
  })
})

const OXLINT = realpathSync(join(REPO_ROOT, 'node_modules/.bin/oxlint'))
const ids = { shortId: 'k3x9', changeId: 'chg_0123456789', changeset: 'cs_abc' }

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

/** Runs the harness until it ends; the first pass dies at `killAt`, the next one replays. */
const runDurably = async (killAt?: string) => {
  const repo = await throwawayRepo({
    '.oxlintrc.json': '{"rules":{"no-debugger":"error"}}',
    'src/a.ts': 'export const a = 0\n',
  })
  const store = new Map<string, string>()
  let doneCalls = 0
  const pass = (kill?: string) =>
    runHarness({
      worktree: repo,
      base: 'main',
      ...ids,
      harness: {
        name: 'durable',
        gates: [oxlintGate({ binary: OXLINT }), fakeFormatter('src/a.ts')],
      },
      agent: idempotentAgent(repo),
      steps: workflowSteps(durableDo(store, kill).workflow),
      markDone: async () => {
        doneCalls++
      },
    })
  let result: HarnessResult
  try {
    result = await pass(killAt)
    assert.equal(killAt, undefined, `${killAt} was never reached`)
  } catch (error) {
    if (!(error instanceof Killed)) throw error
    result = await pass()
  }
  const log = (await gitIn(repo)(['log', '--format=%T %s%n%b%x00'])).trim()
  return { result, log, doneCalls }
}

describe('runHarness on a durable workflow', () => {
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
