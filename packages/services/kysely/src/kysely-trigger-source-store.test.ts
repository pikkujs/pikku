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
  test('registers declared sources', async () => {
    const rows = await store.listTriggerSources()
    assert.deepEqual(
      rows.map((r) => [r.name, r.declared, r.status]),
      [
        ['github', true, null],
        ['stripe', true, null],
      ]
    )
  })

  test('records what setup registered and keeps it across a sync', async () => {
    await store.recordTriggerSource('stripe', {
      status: 'created',
      state: { id: 'we_1' },
    })
    await store.syncTriggerSources([{ name: 'stripe', kind: 'webhook' }])

    const row = await store.getTriggerSource('stripe')
    assert.equal(row!.status, 'created')
    assert.deepEqual(row!.state, { id: 'we_1' })
    assert.equal((await store.getTriggerSource('github'))!.declared, false)
  })

  test('forgets a torn-down source', async () => {
    await store.deleteTriggerSource('github')
    assert.equal(await store.getTriggerSource('github'), null)
  })

  test('refuses an unknown source', async () => {
    await assert.rejects(
      store.recordTriggerSource('nope', { status: 'created' })
    )
  })
})
