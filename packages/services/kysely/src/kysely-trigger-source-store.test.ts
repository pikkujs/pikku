import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import Database from 'better-sqlite3'
import { SerializePlugin } from './serialize-plugin.js'
import type { KyselyPikkuDB } from './kysely-tables.js'
import { KyselyTriggerSourceStore } from './kysely-trigger-source-store.js'
import { applyPikkuSchemas, triggerSourceSchema } from './schema/index.js'

let store: KyselyTriggerSourceStore

beforeEach(async () => {
  const db = new Kysely<KyselyPikkuDB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin(), new SerializePlugin()],
  })
  await applyPikkuSchemas(db, [triggerSourceSchema])
  store = new KyselyTriggerSourceStore(db)
  await store.init()
  await store.syncTriggerSources([
    { name: 'stripe', kind: 'webhook' },
    { name: 'github', kind: 'webhook' },
  ])
})

describe('KyselyTriggerSourceStore', () => {
  test('registers declared sources, disabled', async () => {
    const rows = await store.listTriggerSources()
    assert.deepEqual(
      rows.map((r) => [r.name, r.enabled, r.declared]),
      [
        ['github', false, true],
        ['stripe', false, true],
      ]
    )
  })

  test('records enabling and keeps it across a sync', async () => {
    await store.setTriggerSourceEnabled(
      'stripe',
      true,
      { status: 'created', state: { id: 'we_1' } },
      'u1'
    )
    await store.syncTriggerSources([{ name: 'stripe', kind: 'webhook' }])

    const row = await store.getTriggerSource('stripe')
    assert.equal(row!.enabled, true)
    assert.deepEqual(row!.state, { id: 'we_1' })
    assert.equal(row!.updatedBy, 'u1')
    assert.equal((await store.getTriggerSource('github'))!.declared, false)
  })

  test('prune keeps an enabled orphan unless forced', async () => {
    await store.setTriggerSourceEnabled('stripe', true, { status: 'created' })
    await store.syncTriggerSources([])

    assert.deepEqual(await store.pruneTriggerSources(), ['github'])
    assert.deepEqual(await store.pruneTriggerSources({ force: true }), [
      'stripe',
    ])
  })

  test('refuses an unknown source', async () => {
    await assert.rejects(
      store.setTriggerSourceEnabled('nope', true, { status: 'created' })
    )
  })
})
