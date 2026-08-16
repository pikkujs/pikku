import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  FileScenarioRunStore,
  scenarioRunSummary,
} from './file-scenario-run-store.js'
import type {
  ScenarioResult,
  ScenarioRunRecord,
} from '../wirings/workflow/scenario-run.types.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pikku-scenario-runs-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const record = (
  overrides: Partial<ScenarioRunRecord> = {}
): ScenarioRunRecord => ({
  runId: 'run-1',
  environment: 'local',
  surface: 'browser',
  status: 'running',
  startedAt: '2026-08-15T10:00:00.000Z',
  results: [],
  skipped: [],
  hookFailures: [],
  ...overrides,
})

const result = (overrides: Partial<ScenarioResult> = {}): ScenarioResult => ({
  name: 'todos › a member adds one',
  status: 'passed',
  durationMs: 120,
  ...overrides,
})

describe('FileScenarioRunStore', () => {
  test('a run is readable from the moment it opens, before any scenario finishes', async () => {
    const store = new FileScenarioRunStore({ dir })

    await store.start(record())

    const open = await store.get('run-1')
    assert.equal(open?.status, 'running')
    assert.deepEqual(open?.results, [])
  })

  test('scenarios accumulate as they finish, so a suite killed halfway keeps what ran', async () => {
    const store = new FileScenarioRunStore({ dir })
    await store.start(record())

    await store.recordScenario('run-1', result({ name: 'one' }))
    await store.recordScenario(
      'run-1',
      result({ name: 'two', status: 'failed' })
    )

    const partial = await store.get('run-1')
    assert.deepEqual(
      partial?.results.map((r) => r.name),
      ['one', 'two']
    )
    assert.equal(
      partial?.status,
      'running',
      'a run nobody finished is still running, not passed'
    )
  })

  test('finishing settles the outcome and everything only known at the end', async () => {
    const store = new FileScenarioRunStore({ dir })
    await store.start(record())
    await store.recordScenario('run-1', result())

    await store.finish('run-1', {
      status: 'failed',
      finishedAt: '2026-08-15T10:00:30.000Z',
      skipped: [{ name: 'quarantined', reason: 'flaky' }],
      hookFailures: ['feature after hook failed: boom'],
    })

    const done = await store.get('run-1')
    assert.equal(done?.status, 'failed')
    assert.equal(done?.finishedAt, '2026-08-15T10:00:30.000Z')
    assert.deepEqual(done?.skipped, [{ name: 'quarantined', reason: 'flaky' }])
    assert.equal(done?.results.length, 1, 'finishing does not lose the results')
  })

  test('concurrent scenario writes never lose one to a read-modify-write race', async () => {
    const store = new FileScenarioRunStore({ dir })
    await store.start(record())

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.recordScenario('run-1', result({ name: `scenario-${i}` }))
      )
    )

    const all = await store.get('run-1')
    assert.equal(all?.results.length, 20)
  })

  test('runs list newest first, summarised without loading their stacks', async () => {
    const store = new FileScenarioRunStore({ dir })
    await store.start(
      record({ runId: 'older', startedAt: '2026-08-14T10:00:00.000Z' })
    )
    await store.start(
      record({ runId: 'newer', startedAt: '2026-08-15T10:00:00.000Z' })
    )
    await store.recordScenario(
      'newer',
      result({
        artifacts: [{ scenario: 'x', kind: 'video', path: 'x/admin.mp4' }],
      })
    )
    await store.recordScenario('newer', result({ status: 'failed' }))
    await store.finish('newer', {
      status: 'failed',
      finishedAt: '2026-08-15T10:00:05.000Z',
      skipped: [{ name: 'held', reason: 'no browser' }],
      hookFailures: [],
    })

    const runs = await store.list()

    assert.deepEqual(
      runs.map((r) => r.runId),
      ['newer', 'older']
    )
    assert.deepEqual(
      { ...runs[0] },
      {
        runId: 'newer',
        environment: 'local',
        surface: 'browser',
        status: 'failed',
        startedAt: '2026-08-15T10:00:00.000Z',
        finishedAt: '2026-08-15T10:00:05.000Z',
        durationMs: 5000,
        passed: 1,
        failed: 1,
        skipped: 1,
        artifacts: 1,
      }
    )
  })

  test('a limit takes the newest runs, not whichever the filesystem returned first', async () => {
    const store = new FileScenarioRunStore({ dir })
    for (const day of ['11', '12', '13']) {
      await store.start(
        record({
          runId: `run-${day}`,
          startedAt: `2026-08-${day}T10:00:00.000Z`,
        })
      )
    }

    const runs = await store.list({ limit: 2 })

    assert.deepEqual(
      runs.map((r) => r.runId),
      ['run-13', 'run-12']
    )
  })

  test('opening a run drops the oldest past the limit, with everything they filed', async () => {
    const store = new FileScenarioRunStore({ dir, keep: 2 })
    for (const day of ['11', '12', '13']) {
      await store.start(
        record({
          runId: `run-${day}`,
          startedAt: `2026-08-${day}T10:00:00.000Z`,
        })
      )
      writeFileSync(join(dir, `run-${day}`, 'video.mp4'), 'x')
    }

    assert.deepEqual(
      (await store.list()).map((r) => r.runId),
      ['run-13', 'run-12']
    )
    assert.equal(
      existsSync(join(dir, 'run-11')),
      false,
      'the pruned run takes its artifacts with it'
    )
  })

  test('a keep of one still leaves the run being opened', async () => {
    const store = new FileScenarioRunStore({ dir, keep: 1 })
    await store.start(record({ runId: 'first' }))
    await store.start(record({ runId: 'second' }))

    assert.deepEqual(
      (await store.list()).map((r) => r.runId),
      ['second']
    )
  })

  test('artifacts are filed against the scenario the run knows them by', async () => {
    const store = new FileScenarioRunStore({ dir })
    await store.start(record())
    await store.recordScenario('run-1', result({ name: 'checkout › breaks' }))
    await store.recordScenario('run-1', result({ name: 'checkout › works' }))

    await store.attachArtifacts('run-1', [
      { scenario: 'checkout › breaks', kind: 'video', path: 'a/admin.mp4' },
      {
        scenario: 'checkout › breaks',
        kind: 'failure',
        path: 'a/failure-admin.png',
      },
      { scenario: 'a scenario that never ran', kind: 'video', path: 'b/x.mp4' },
    ])

    const [broke, worked] = (await store.get('run-1'))!.results
    assert.deepEqual(
      broke?.artifacts?.map((a) => a.path),
      ['a/admin.mp4', 'a/failure-admin.png']
    )
    assert.equal(
      worked?.artifacts,
      undefined,
      'a scenario that produced nothing gets no empty list to render'
    )
  })

  test('a run id from outside cannot read its way out of the store', async () => {
    const store = new FileScenarioRunStore({ dir })
    writeFileSync(join(dir, 'run.json'), JSON.stringify(record()))

    assert.equal(await store.get('..'), undefined)
    assert.equal(await store.get('../..'), undefined)
    assert.equal(existsSync(join(dir, 'run.json')), true)

    await store.remove('../..')
    assert.equal(
      existsSync(dir),
      true,
      'a traversing id must not delete the store itself'
    )
  })

  test('an artifact is served with the type its extension implies', async () => {
    const store = new FileScenarioRunStore({ dir })
    await store.start(record())
    mkdirSync(join(dir, 'run-1', 'checkout'))
    writeFileSync(join(dir, 'run-1', 'checkout', 'admin.mp4'), 'footage')
    writeFileSync(join(dir, 'run-1', 'checkout', '01-shot.png'), 'image')

    const video = await store.readArtifact('run-1', 'checkout/admin.mp4')
    const shot = await store.readArtifact('run-1', 'checkout/01-shot.png')

    assert.equal(video?.contentType, 'video/mp4')
    assert.equal(Buffer.from(video!.body).toString(), 'footage')
    assert.equal(shot?.contentType, 'image/png')
  })

  test('an artifact path cannot climb out of its run', async () => {
    const store = new FileScenarioRunStore({ dir })
    await store.start(record())
    writeFileSync(join(dir, 'secret.txt'), 'not yours')

    assert.equal(await store.readArtifact('run-1', '../secret.txt'), undefined)
    assert.equal(
      await store.readArtifact('run-1', 'checkout/../../secret.txt'),
      undefined
    )
    assert.equal(await store.readArtifact('run-1', '/etc/hosts'), undefined)
    assert.equal(
      await store.readArtifact('run-1', 'checkout/never-taken.png'),
      undefined,
      'and an artifact that was never filed is simply absent'
    )
  })

  test('an artifact of a run that never existed is absent, not an error', async () => {
    const store = new FileScenarioRunStore({ dir })

    assert.equal(await store.readArtifact('run-1', 'a/b.png'), undefined)
  })

  test('a half-written run is skipped rather than failing the whole listing', async () => {
    const store = new FileScenarioRunStore({ dir })
    await store.start(record())
    mkdirSync(join(dir, 'killed-mid-write'))
    writeFileSync(join(dir, 'killed-mid-write', 'run.json'), '{"runId":')

    const runs = await store.list()

    assert.deepEqual(
      runs.map((r) => r.runId),
      ['run-1']
    )
  })

  test('a store with nothing in it lists nothing rather than throwing', async () => {
    const store = new FileScenarioRunStore({ dir: join(dir, 'never-created') })

    assert.deepEqual(await store.list(), [])
    assert.equal(await store.get('run-1'), undefined)
  })

  test('recording against a run that does not exist is ignored, not invented', async () => {
    const store = new FileScenarioRunStore({ dir })

    await store.recordScenario('never-started', result())

    assert.deepEqual(await store.list(), [])
  })

  test('removing a run takes its whole folder', async () => {
    const store = new FileScenarioRunStore({ dir })
    await store.start(record())
    writeFileSync(join(dir, 'run-1', 'video.mp4'), 'x')

    await store.remove('run-1')

    assert.equal(existsSync(join(dir, 'run-1')), false)
  })
})

describe('scenarioRunSummary', () => {
  test('a run still going has no duration to report', () => {
    const summary = scenarioRunSummary(record({ results: [result()] }))

    assert.equal(summary.durationMs, undefined)
    assert.equal(summary.status, 'running')
    assert.equal(summary.passed, 1)
  })
})
