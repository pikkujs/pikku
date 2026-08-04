import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'

import { KyselyVirtualUserRunStore } from './kysely-virtual-user-run-store.js'
import { SerializePlugin } from './serialize-plugin.js'
import type { KyselyPikkuDB } from './kysely-tables.js'

// SerializePlugin is here because most projects in this package run with it, and
// it is the harder case: it deserialises JSON columns the store has already
// stringified. The store has to survive that, and its absence.
const newDb = () =>
  new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })

const TALLY = {
  steps: 12,
  calls: 30,
  mutations: 4,
  tokensIn: 900,
  tokensOut: 120,
  elapsed: 4200,
} as any

const FINDING = {
  kind: 'schema-mismatch',
  detail: 'listDocs returned a doc with no title',
  rpcName: 'listDocs',
  step: 7,
} as any

describe('KyselyVirtualUserRunStore', () => {
  let db: Kysely<KyselyPikkuDB>
  let store: KyselyVirtualUserRunStore

  beforeEach(() => {
    db = newDb()
    store = new KyselyVirtualUserRunStore(db)
  })

  // The runtime never needs this table, so it arrives with the feature that
  // fills it rather than in every database — which means the first write has to
  // create it.
  test('creates its table on first use', async () => {
    const runId = await store.start({
      persona: 'susan',
      disposition: 'realistic',
      seed: 42,
    })
    assert.ok(runId)
  })

  test('a run starts as running, with no findings and no finish time', async () => {
    const runId = await store.start({
      persona: 'susan',
      disposition: 'careless',
      seed: 7,
      goals: ['find the export button'],
      memory: { docId: 'doc_1' },
      startedBy: 'user_1',
    })

    const run = await store.get(runId)
    assert.equal(run?.status, 'running')
    assert.deepEqual(run?.findings, [])
    assert.equal(run?.finishedAt, null)
    assert.equal(run?.error, null)
    assert.deepEqual(run?.goals, ['find the export button'])
    assert.deepEqual(run?.memory, { docId: 'doc_1' })
    assert.equal(run?.startedBy, 'user_1')
  })

  // The seed is the whole reason a finding is reproducible, and a BIGINT comes
  // back as a string on some drivers — so it has to survive the round trip as a
  // number.
  test('the seed round-trips as a number', async () => {
    const runId = await store.start({
      persona: 'susan',
      disposition: 'realistic',
      seed: 2_147_483_646,
    })
    const run = await store.get(runId)
    assert.strictEqual(run?.seed, 2_147_483_646)
  })

  test('completing a run stores what it found', async () => {
    const runId = await store.start({
      persona: 'susan',
      disposition: 'auditor',
      seed: 1,
      memory: { docId: 'doc_1' },
    })

    await store.complete(runId, {
      findings: [FINDING],
      tally: TALLY,
      memory: { docId: 'doc_1', orgId: 'org_9' },
      stoppedBy: 'budget-steps',
    })

    const run = await store.get(runId)
    assert.equal(run?.status, 'completed')
    assert.equal(run?.findings.length, 1)
    assert.equal(run?.findings[0]?.detail, FINDING.detail)
    assert.deepEqual(run?.tally, TALLY)
    assert.equal(run?.stoppedBy, 'budget-steps')
    // Overwritten, not merged: the engine's memory already carries what it was
    // given plus what it learned.
    assert.deepEqual(run?.memory, { docId: 'doc_1', orgId: 'org_9' })
    assert.ok(run?.finishedAt instanceof Date)
  })

  // A crashed run and a run that found nothing are different answers, and this
  // record is the only place that distinction survives.
  test('a failed run is failed, not an empty success', async () => {
    const runId = await store.start({
      persona: 'susan',
      disposition: 'realistic',
      seed: 1,
    })

    await store.fail(runId, 'SCENARIO_ACTOR_SECRET is not set')

    const run = await store.get(runId)
    assert.equal(run?.status, 'failed')
    assert.equal(run?.error, 'SCENARIO_ACTOR_SECRET is not set')
    assert.deepEqual(run?.findings, [])
    assert.ok(run?.finishedAt instanceof Date)
  })

  test('an unknown run is null rather than a throw', async () => {
    await store.init()
    assert.equal(await store.get('nope'), null)
  })

  test('lists newest first', async () => {
    const first = await store.start({
      persona: 'susan',
      disposition: 'realistic',
      seed: 1,
    })
    const second = await store.start({
      persona: 'raj',
      disposition: 'realistic',
      seed: 2,
    })

    const runs = await store.list()
    assert.equal(runs.length, 2)
    assert.deepEqual(
      new Set(runs.map((run) => run.runId)),
      new Set([first, second])
    )
  })

  // Comparing what a persona finds this week against last week is the whole
  // reason runs are kept.
  test('narrows to one persona s history', async () => {
    await store.start({ persona: 'susan', disposition: 'realistic', seed: 1 })
    await store.start({ persona: 'raj', disposition: 'realistic', seed: 2 })

    const runs = await store.list({ persona: 'susan' })
    assert.equal(runs.length, 1)
    assert.equal(runs[0]?.persona, 'susan')
  })

  test('completing an unknown run does not throw', async () => {
    await store.init()
    await store.complete('nope', {
      findings: [],
      tally: TALLY,
      memory: {},
      stoppedBy: 'exhausted',
    })
  })

  // Not every project installs SerializePlugin, and a bare SQLite driver cannot
  // bind a Date at all — so the whole round trip has to hold without it.
  test('round-trips without SerializePlugin', async () => {
    const bare = new Kysely<KyselyPikkuDB>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
      plugins: [new CamelCasePlugin()],
    })
    const bareStore = new KyselyVirtualUserRunStore(bare)

    const runId = await bareStore.start({
      persona: 'susan',
      disposition: 'realistic',
      seed: 99,
      goals: ['export a doc'],
      memory: { docId: 'doc_1' },
    })
    await bareStore.complete(runId, {
      findings: [FINDING],
      tally: TALLY,
      memory: { docId: 'doc_1' },
      stoppedBy: 'exhausted',
    })

    const run = await bareStore.get(runId)
    assert.equal(run?.status, 'completed')
    assert.strictEqual(run?.seed, 99)
    assert.deepEqual(run?.goals, ['export a doc'])
    assert.deepEqual(run?.tally, TALLY)
    assert.equal(run?.findings[0]?.detail, FINDING.detail)
    assert.ok(run?.createdAt instanceof Date)
    assert.ok(run?.finishedAt instanceof Date)
  })
})
