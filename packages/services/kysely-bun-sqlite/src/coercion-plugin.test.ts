import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { QueryResult, UnknownRow } from 'kysely'
import { createCoercionPlugin } from './coercion-plugin.js'

const runTransform = async (
  map: Parameters<typeof createCoercionPlugin>[0]['map'],
  rows: UnknownRow[]
): Promise<UnknownRow[]> => {
  const plugin = createCoercionPlugin({ map })
  const result = { rows } as QueryResult<UnknownRow>
  const out = await plugin.transformResult({
    result,
    queryId: { queryId: 'test' },
  } as Parameters<NonNullable<typeof plugin.transformResult>>[0])
  return out.rows as UnknownRow[]
}

describe('createCoercionPlugin', () => {
  test('transformQuery passes the node through untouched', () => {
    const plugin = createCoercionPlugin({ map: {} })
    const node = { kind: 'SelectQueryNode' } as any
    assert.equal(
      plugin.transformQuery({ node, queryId: { queryId: 'x' } } as any),
      node
    )
  })

  test('coerces date columns from ISO strings to Date', async () => {
    const [row] = await runTransform({ users: { created_at: 'date' } }, [
      { created_at: '2026-06-26T00:00:00.000Z' },
    ])
    assert.ok(row.created_at instanceof Date)
    assert.equal(
      (row.created_at as Date).toISOString(),
      '2026-06-26T00:00:00.000Z'
    )
  })

  test('leaves unparseable date strings untouched', async () => {
    const [row] = await runTransform({ users: { created_at: 'date' } }, [
      { created_at: 'not-a-date' },
    ])
    assert.equal(row.created_at, 'not-a-date')
  })

  test('coerces bool columns from 0/1 numbers and bigints', async () => {
    const rows = await runTransform(
      { users: { is_active: 'bool', has_pets: 'bool' } },
      [{ is_active: 1, has_pets: 0n }]
    )
    assert.equal(rows[0].is_active, true)
    assert.equal(rows[0].has_pets, false)
  })

  test('parses json columns and tolerates invalid json', async () => {
    const rows = await runTransform(
      { users: { meta: 'json', broken: 'json' } },
      [{ meta: '{"a":1}', broken: '{bad' }]
    )
    assert.deepEqual(rows[0].meta, { a: 1 })
    assert.equal(rows[0].broken, '{bad')
  })

  test('passes through null values and unmapped columns', async () => {
    const rows = await runTransform({ users: { created_at: 'date' } }, [
      { created_at: null, name: 'leave me' },
    ])
    assert.equal(rows[0].created_at, null)
    assert.equal(rows[0].name, 'leave me')
  })

  test('matches both snake_case and camelCase column names', async () => {
    const rows = await runTransform({ users: { created_at: 'date' } }, [
      { createdAt: '2026-06-26T00:00:00.000Z' },
    ])
    assert.ok(rows[0].createdAt instanceof Date)
  })

  test('leaves columns ambiguous across tables uncoerced', async () => {
    const rows = await runTransform(
      { users: { value: 'json' }, events: { value: 'bool' } },
      [{ value: '{"a":1}' }]
    )
    assert.equal(rows[0].value, '{"a":1}')
  })

  test('still coerces columns that agree across tables', async () => {
    const rows = await runTransform(
      { users: { active: 'bool' }, events: { active: 'bool' } },
      [{ active: 1 }]
    )
    assert.equal(rows[0].active, true)
  })
})
