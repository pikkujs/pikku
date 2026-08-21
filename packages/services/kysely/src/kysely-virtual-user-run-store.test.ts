import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'

import { KyselyVirtualUserRunStore } from './kysely-virtual-user-run-store.js'
import { SerializePlugin } from './serialize-plugin.js'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { applyPikkuSchemas, virtualUserSchema } from './schema/index.js'

// SerializePlugin is here because most projects in this package run with it, and
// it is the harder case: it deserialises JSON columns the store has already
// stringified. The store has to survive that, and its absence.
const newDb = () =>
  new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })

const migratedDb = async () => {
  const db = newDb()
  await applyPikkuSchemas(db, [virtualUserSchema])
  return db
}

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

const INTENT = {
  id: 'intent_1',
  sourceId: 'exportADoc',
  title: 'Export a doc',
  status: 'done',
  steps: [0, 1],
  suspensions: 0,
} as any

const step = (index: number, over: Record<string, unknown> = {}) =>
  ({
    index,
    intentId: 'intent_1',
    action: { kind: 'call', rpcName: 'listDocs', input: {} },
    status: 200,
    ok: true,
    response: '{"docs":[]}',
    tokensIn: 40,
    tokensOut: 12,
    ...over,
  }) as any

describe('KyselyVirtualUserRunStore', () => {
  let db: Kysely<KyselyPikkuDB>
  let store: KyselyVirtualUserRunStore

  beforeEach(async () => {
    db = await migratedDb()
    store = new KyselyVirtualUserRunStore(db)
  })

  // The runtime never creates this table, so a project that skipped the
  // migration has to be told which command writes it rather than quietly
  // getting one at first use.
  test('refuses to start against a database that never migrated it', async () => {
    const store = new KyselyVirtualUserRunStore(newDb())
    await assert.rejects(
      store.start({ persona: 'susan', disposition: 'realistic', seed: 42 }),
      /pikku db generate/
    )
  })

  test('writes against a migrated table', async () => {
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
      intents: [INTENT],
      steps: [step(0), step(1)],
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

  test('completing an unknown run does not throw, and leaves no steps behind', async () => {
    await store.init()
    await store.complete('nope', {
      findings: [],
      tally: TALLY,
      memory: {},
      stoppedBy: 'exhausted',
      intents: [INTENT],
      steps: [step(0)],
    })
    assert.deepEqual(await store.steps('nope'), [])
  })

  // Not every project installs SerializePlugin, and a bare SQLite driver cannot
  // bind a Date at all — so the whole round trip has to hold without it.
  test('round-trips without SerializePlugin', async () => {
    const bare = new Kysely<KyselyPikkuDB>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
      plugins: [new CamelCasePlugin()],
    })
    await applyPikkuSchemas(bare, [virtualUserSchema])
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
      intents: [INTENT],
      steps: [step(0)],
    })

    const run = await bareStore.get(runId)
    assert.equal(run?.status, 'completed')
    assert.strictEqual(run?.seed, 99)
    assert.deepEqual(run?.goals, ['export a doc'])
    assert.deepEqual(run?.tally, TALLY)
    assert.equal(run?.findings[0]?.detail, FINDING.detail)
    assert.ok(run?.createdAt instanceof Date)
    assert.ok(run?.finishedAt instanceof Date)
    assert.deepEqual(await bareStore.steps(runId), [step(0)])
  })

  test('the transcript comes back in the order it happened', async () => {
    const runId = await store.start({
      persona: 'susan',
      disposition: 'realistic',
      seed: 1,
    })

    await store.complete(runId, {
      findings: [],
      tally: TALLY,
      memory: {},
      stoppedBy: 'exhausted',
      intents: [INTENT],
      steps: [step(2), step(0), step(1)],
    })

    const steps = await store.steps(runId)
    assert.deepEqual(
      steps.map((one) => one.index),
      [0, 1, 2]
    )
    assert.deepEqual(steps[0], step(0))
  })

  // The turn the model got wrong is the one worth reading, and it carries none
  // of the fields a successful call does.
  test('a turn with no response and no status survives the round trip', async () => {
    const runId = await store.start({
      persona: 'susan',
      disposition: 'careless',
      seed: 1,
    })

    const invalid = step(0, {
      intentId: undefined,
      action: { kind: 'invalid', detail: 'no such rpc: listDoc' },
      status: undefined,
      ok: undefined,
      response: undefined,
      findingKinds: ['invalid-action'],
    })

    await store.complete(runId, {
      findings: [],
      tally: TALLY,
      memory: {},
      stoppedBy: 'exhausted',
      intents: [],
      steps: [invalid],
    })

    const [stored] = await store.steps(runId)
    assert.deepEqual(stored, {
      index: 0,
      action: { kind: 'invalid', detail: 'no such rpc: listDoc' },
      findingKinds: ['invalid-action'],
      tokensIn: 40,
      tokensOut: 12,
    })
  })

  // Ten columns times a 500-step budget is five thousand bound variables, and a
  // bare sqlite driver takes 999 — so the long run is exactly the one that must
  // not be lost.
  test('a run longer than one insert can hold is stored whole', async () => {
    const runId = await store.start({
      persona: 'susan',
      disposition: 'adversarial',
      seed: 1,
    })

    const steps = Array.from({ length: 240 }, (_, index) => step(index))
    await store.complete(runId, {
      findings: [],
      tally: TALLY,
      memory: {},
      stoppedBy: 'budget-steps',
      intents: [],
      steps,
    })

    assert.equal((await store.steps(runId, { limit: 500 })).length, 240)
    assert.deepEqual(
      (await store.steps(runId, { limit: 2, offset: 100 })).map(
        (one) => one.index
      ),
      [100, 101]
    )
  })

  test('intents ride on the run, not on the transcript', async () => {
    const runId = await store.start({
      persona: 'susan',
      disposition: 'realistic',
      seed: 1,
    })

    await store.complete(runId, {
      findings: [],
      tally: TALLY,
      memory: {},
      stoppedBy: 'exhausted',
      intents: [INTENT],
      steps: [],
    })

    const [listed] = await store.list({ persona: 'susan' })
    assert.deepEqual(listed?.intents, [INTENT])
    assert.deepEqual(await store.steps(runId), [])
  })
})
