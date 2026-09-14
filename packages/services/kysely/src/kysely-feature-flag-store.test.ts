import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'
import { SerializePlugin } from './serialize-plugin.js'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyFeatureFlagStore } from './kysely-feature-flag-store.js'
import { applyPikkuSchemas, flagSchema } from './schema/index.js'

const FLAGS = [
  { name: 'sandboxes', description: 'Sandboxes', anyOf: ['admin:sandboxes'] },
  { name: 'newBilling' },
]

let db: Kysely<KyselyPikkuDB>
let store: KyselyFeatureFlagStore

beforeEach(async () => {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  db = new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
  await applyPikkuSchemas(db, [flagSchema])
  store = new KyselyFeatureFlagStore(db, { ttlMs: 0 })
  await store.init()
  await store.syncFlags(FLAGS)
})

describe('KyselyFeatureFlagStore — syncFlags', () => {
  test('registers the declared flags, off', async () => {
    const rows = await store.listFlags()
    assert.deepEqual(
      rows.map((r) => ({
        name: r.name,
        enabled: r.enabled,
        declared: r.declared,
      })),
      [
        { name: 'newBilling', enabled: false, declared: true },
        { name: 'sandboxes', enabled: false, declared: true },
      ]
    )
  })

  test('keeps the declaration readable', async () => {
    const flag = (await store.listFlags()).find((f) => f.name === 'sandboxes')
    assert.deepEqual(flag?.anyOf, ['admin:sandboxes'])
    assert.equal(flag?.description, 'Sandboxes')
  })

  test('is idempotent', async () => {
    await store.syncFlags(FLAGS)
    assert.equal((await store.listFlags()).length, 2)
  })

  test('never re-enables a flag somebody killed', async () => {
    await store.setEnabled('sandboxes', true)
    await store.syncFlags(FLAGS)
    const flag = (await store.listFlags()).find((f) => f.name === 'sandboxes')
    assert.equal(flag?.enabled, true)

    await store.setEnabled('sandboxes', false, 'oncall', 'p1 incident')
    await store.syncFlags(FLAGS)
    const killed = (await store.listFlags()).find((f) => f.name === 'sandboxes')
    assert.equal(killed?.enabled, false)
  })

  test('re-syncs the declaration itself', async () => {
    await store.syncFlags([{ name: 'sandboxes', anyOf: ['admin:all'] }])
    const flag = (await store.listFlags()).find((f) => f.name === 'sandboxes')
    assert.deepEqual(flag?.anyOf, ['admin:all'])
  })

  test('marks an undeclared flag rather than deleting it', async () => {
    await store.setEnabled('newBilling', true)
    await store.syncFlags([FLAGS[0]!])

    assert.deepEqual(await store.findStaleFlags(), ['newBilling'])
    const flag = (await store.listFlags()).find((f) => f.name === 'newBilling')
    assert.deepEqual(
      { declared: flag?.declared, enabled: flag?.enabled },
      { declared: false, enabled: true }
    )
  })
})

describe('KyselyFeatureFlagStore — snapshot', () => {
  test('reflects the switch', async () => {
    assert.equal((await store.snapshot())['sandboxes']?.enabled, false)
    await store.setEnabled('sandboxes', true)
    assert.equal((await store.snapshot())['sandboxes']?.enabled, true)
  })

  test('carries the rollout', async () => {
    await store.setRollout('sandboxes', 25)
    assert.equal((await store.snapshot())['sandboxes']?.rolloutPercent, 25)
    await store.setRollout('sandboxes', null)
    assert.equal((await store.snapshot())['sandboxes']?.rolloutPercent, null)
  })

  test('refuses a rollout outside 0-100', async () => {
    await assert.rejects(() => store.setRollout('sandboxes', 140))
  })

  test('carries overrides, keyed by subject id', async () => {
    await store.setOverride('sandboxes', { organizationId: 'org-1' }, true)
    assert.deepEqual((await store.snapshot())['sandboxes']?.overrides, {
      'org-1': true,
    })
  })

  test('an override is replaced, not duplicated', async () => {
    await store.setOverride('sandboxes', { organizationId: 'org-1' }, true)
    await store.setOverride('sandboxes', { organizationId: 'org-1' }, false)
    assert.deepEqual((await store.snapshot())['sandboxes']?.overrides, {
      'org-1': false,
    })
  })

  test('clearing an override removes it', async () => {
    await store.setOverride('sandboxes', { organizationId: 'org-1' }, true)
    await store.clearOverride('sandboxes', { organizationId: 'org-1' })
    assert.deepEqual((await store.snapshot())['sandboxes']?.overrides, {})
  })

  // The panel reads this as when the pin was granted, so re-pinning the same
  // subject has to move it — the column's default fires on insert only.
  test('re-granting an override refreshes when it was granted', async () => {
    await store.setOverride('sandboxes', { organizationId: 'org-1' }, true, 'a')
    const backdated = new Date('2020-01-01T00:00:00.000Z')
    await db
      .updateTable('pikkuFeatureFlagOverrides')
      .set({ grantedAt: backdated })
      .where('subjectId', '=', 'org-1')
      .execute()

    await store.setOverride(
      'sandboxes',
      { organizationId: 'org-1' },
      false,
      'b'
    )

    const [override] = await store.listOverrides('sandboxes')
    assert.equal(override?.grantedBy, 'b')
    assert.ok(
      new Date(override!.grantedAt!).getTime() > backdated.getTime(),
      `expected a refreshed timestamp, got ${override?.grantedAt}`
    )
  })

  test('an override needs a subject to be about', async () => {
    await assert.rejects(() => store.setOverride('sandboxes', {}, true))
  })
})

describe('KyselyFeatureFlagStore — prune', () => {
  test('removes undeclared flags and their overrides', async () => {
    await store.setOverride('newBilling', { organizationId: 'org-1' }, true)
    await store.syncFlags([FLAGS[0]!])

    assert.deepEqual(await store.pruneFlags(), ['newBilling'])
    assert.deepEqual(await store.findStaleFlags(), [])

    const overrides = await db
      .selectFrom('pikkuFeatureFlagOverrides')
      .selectAll()
      .execute()
    assert.equal(overrides.length, 0)
  })

  test('leaves declared flags alone', async () => {
    assert.deepEqual(await store.pruneFlags(), [])
    assert.equal((await store.listFlags()).length, 2)
  })

  test('spares a flag redeclared after it was found stale', async () => {
    // The deploy that brings the flag back lands between reading the stale set
    // and deleting it. Deleting on the earlier answer would take a live flag
    // and cascade away every override an operator had set on it.
    await store.syncFlags([FLAGS[0]!])
    const stale = await store.findStaleFlags()
    assert.deepEqual(stale, ['newBilling'])

    await store.syncFlags(FLAGS)
    assert.deepEqual(await store.pruneFlags(), [])
    assert.equal((await store.listFlags()).length, 2)
  })
})
