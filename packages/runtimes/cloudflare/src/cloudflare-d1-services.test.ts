import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'kysely'
import { createCoercionPlugin } from '@pikku/kysely'
import type { D1Database } from '@cloudflare/workers-types'
import { createD1Kysely } from './cloudflare-d1-services.js'

const stubD1 = (rows: unknown[]): D1Database => {
  const statement = {
    bind: () => statement,
    all: async () => ({ results: rows, meta: { changes: 0 } }),
  }
  return { prepare: () => statement } as unknown as D1Database
}

describe('createD1Kysely', () => {
  test('leaves an integer bool column alone when no plugin is passed', async () => {
    const db = createD1Kysely(stubD1([{ active: 1 }]))
    const { rows } = await sql`select active from garment`.execute(db)
    assert.equal((rows[0] as { active: unknown }).active, 1)
  })

  test('applies a coercion plugin passed through options', async () => {
    const db = createD1Kysely(stubD1([{ active: 1 }]), {
      plugins: [createCoercionPlugin({ map: { garment: { active: 'bool' } } })],
    })
    const { rows } = await sql`select active from garment`.execute(db)
    assert.equal((rows[0] as { active: unknown }).active, true)
  })

  test('still deserializes json with a coercion plugin layered on', async () => {
    const db = createD1Kysely(stubD1([{ sizes: '["S","M"]' }]), {
      plugins: [createCoercionPlugin({ map: { garment: { sizes: 'json' } } })],
    })
    const { rows } = await sql`select sizes from garment`.execute(db)
    assert.deepEqual((rows[0] as { sizes: unknown }).sizes, ['S', 'M'])
  })
})
