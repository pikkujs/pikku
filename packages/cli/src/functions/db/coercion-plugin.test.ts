import assert from 'node:assert/strict'
import test from 'node:test'
import { createCoercionPlugin, type CoercionMap } from './coercion-plugin.js'

function selectFrom(table: string) {
  return {
    kind: 'SelectQueryNode',
    from: {
      kind: 'FromNode',
      froms: [
        {
          kind: 'TableNode',
          table: {
            kind: 'SchemableIdentifierNode',
            identifier: {
              kind: 'IdentifierNode',
              name: table,
            },
          },
        },
      ],
    },
  }
}

test('createCoercionPlugin uses table-qualified coercions when names collide', async () => {
  const map: CoercionMap = {
    users: { settings: 'json' },
    posts: { settings: 'bool' },
  }
  const plugin = createCoercionPlugin({ map })
  const queryId = {}

  plugin.transformQuery({ queryId, node: selectFrom('users') })
  const result = await plugin.transformResult({
    queryId,
    result: {
      rows: [{ settings: '{"theme":"dark"}' }],
    },
  })

  assert.deepEqual(result.rows, [{ settings: { theme: 'dark' } }])
})

test('createCoercionPlugin still falls back to flat camelCase keys', async () => {
  const map: CoercionMap = {
    users: { created_at: 'date' },
  }
  const plugin = createCoercionPlugin({ map })
  const queryId = {}

  const result = await plugin.transformResult({
    queryId,
    result: {
      rows: [{ createdAt: '2026-01-02T03:04:05.000Z' }],
    },
  })

  assert.ok(result.rows[0].createdAt instanceof Date)
})
