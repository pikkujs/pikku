import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { listUsers } from './list-users.function.js'

type Row = Record<string, any>

type Clause = { field: string; operator?: string; value: any }

/**
 * Only the operators the function is allowed to use. Anything else throws
 * rather than guessing, which is what pins the query away from `ne` on a
 * nullable marker column — the shape that empties the directory on a host
 * whose migration left `actor` or `fabric` NULL.
 */
const matches = (row: Row, where: Clause[]) =>
  where.every((clause) => {
    const value = row[clause.field]
    switch (clause.operator ?? 'eq') {
      case 'eq':
        return value === clause.value
      case 'contains':
        return typeof value === 'string' && value.includes(clause.value)
      case 'not_in':
        return !(clause.value as any[]).includes(value)
      default:
        throw new Error(`unsupported operator: ${clause.operator}`)
    }
  })

type FakeOptions = {
  /** Marker columns the host's plugins declared. */
  declared?: string[]
  additionalFields?: Record<string, any>
}

const fakeAuth = (
  rows: Row[],
  { declared = ['actor', 'fabric'], additionalFields = {} }: FakeOptions = {}
) =>
  (async () => ({
    $context: Promise.resolve({
      options: { user: { additionalFields } },
      tables: {
        user: {
          fields: Object.fromEntries(
            [...declared, 'email', 'name'].map((name) => [name, {}])
          ),
        },
      },
      adapter: {
        findMany: async ({ where = [], limit, offset, sortBy }: any) => {
          let found = rows.filter((row) => matches(row, where))
          if (sortBy) {
            found = [...found].sort((a, b) =>
              sortBy.direction === 'desc'
                ? Number(b[sortBy.field]) - Number(a[sortBy.field])
                : Number(a[sortBy.field]) - Number(b[sortBy.field])
            )
          }
          return found.slice(
            offset ?? 0,
            (offset ?? 0) + (limit ?? found.length)
          )
        },
        count: async ({ where = [] }: any) =>
          rows.filter((row) => matches(row, where)).length,
      },
    }),
  })) as any

/** `createdAt` doubles as the sort key, so newest is simply highest. */
const person = (id: string, createdAt: number, extra: Row = {}) => ({
  id,
  email: `${id}@example.com`,
  createdAt,
  ...extra,
})

const call = (
  services: any,
  data: any = {},
  session: any = { scopes: ['*'] }
) => (listUsers as any).func(services, data, { session })

describe('admin listUsers — who is in the directory', () => {
  test('leaves out actors, fabric users and the platform principal', async () => {
    const auth = fakeAuth([
      person('alice', 3),
      person('bot', 2, { actor: true }),
      person('operator', 1, { fabric: true }),
      person('pikku-platform', 0),
    ])

    const { users, total } = await call({ auth })

    assert.deepEqual(
      users.map((user: Row) => user.id),
      ['alice']
    )
    assert.equal(total, 1, 'total counts people, not rows')
  })

  test('does not query a marker column the host never declared', async () => {
    const auth = fakeAuth([person('alice', 1)], { declared: [] })

    const { users } = await call({ auth })

    assert.deepEqual(
      users.map((user: Row) => user.id),
      ['alice']
    )
  })

  test('answers nothing at all without better-auth', async () => {
    assert.deepEqual(await call({ auth: undefined }), { users: [], total: 0 })
  })
})

describe('admin listUsers — paging', () => {
  const directory = [
    person('a', 5),
    person('bot', 4, { actor: true }),
    person('b', 3),
    person('c', 2),
    person('d', 1),
  ]

  test('fills a page with people, not with rows it then drops', async () => {
    const { users } = await call({ auth: fakeAuth(directory) }, { limit: 2 })

    assert.deepEqual(
      users.map((user: Row) => user.id),
      ['a', 'b']
    )
  })

  test('offset skips people, so no one lands on two pages', async () => {
    const auth = fakeAuth(directory)

    const first = await call({ auth }, { limit: 2, offset: 0 })
    const second = await call({ auth }, { limit: 2, offset: 2 })

    assert.deepEqual(
      [...first.users, ...second.users].map((user: Row) => user.id),
      ['a', 'b', 'c', 'd']
    )
  })

  test('total is the whole match, not the page', async () => {
    const { users, total } = await call(
      { auth: fakeAuth(directory) },
      { limit: 2 }
    )

    assert.equal(users.length, 2)
    assert.equal(total, 4)
  })

  test('newest first', async () => {
    const { users } = await call({
      auth: fakeAuth([person('old', 1), person('new', 9), person('mid', 5)]),
    })

    assert.deepEqual(
      users.map((user: Row) => user.id),
      ['new', 'mid', 'old']
    )
  })

  test('search narrows the page and the total together', async () => {
    const auth = fakeAuth([
      person('alice', 3),
      { id: 'bob', email: 'bob@other.org', createdAt: 2 },
    ])

    const { users, total } = await call({ auth }, { search: 'example.com' })

    assert.deepEqual(
      users.map((user: Row) => user.id),
      ['alice']
    )
    assert.equal(total, 1)
  })
})

describe('admin listUsers — roles', () => {
  const auth = () => fakeAuth([person('alice', 2), person('bob', 1)])

  const fakeScopeService = (
    byUser: Record<string, string[]>,
    calls: string[][] = []
  ) => ({
    listRolesForUsers: async (userIds: string[]) => {
      calls.push(userIds)
      return Object.fromEntries(userIds.map((id) => [id, byUser[id] ?? []]))
    },
  })

  test('are left out unless asked for', async () => {
    const calls: string[][] = []
    const { users } = await call({
      auth: auth(),
      scopeService: fakeScopeService({}, calls),
    })

    assert.equal(users[0].roles, undefined)
    assert.deepEqual(
      calls,
      [],
      'a directory nobody asked roles for costs no query'
    )
  })

  test('come back in one query for the whole page', async () => {
    const calls: string[][] = []
    const { users } = await call(
      {
        auth: auth(),
        scopeService: fakeScopeService({ alice: ['admin'] }, calls),
      },
      { includeRoles: true }
    )

    assert.deepEqual(calls, [['alice', 'bob']], 'one call, not one per user')
    assert.deepEqual(users[0].roles, ['admin'])
    assert.deepEqual(users[1].roles, [], 'no roles is empty, not missing')
  })

  test('are refused without admin:scopes:read', async () => {
    await assert.rejects(
      () =>
        call(
          { auth: auth(), scopeService: fakeScopeService({}) },
          { includeRoles: true },
          { scopes: ['admin:users:list'] }
        ),
      /admin:scopes:read/
    )
  })

  test('the directory itself needs no scope beyond its own', async () => {
    const { users } = await call(
      { auth: auth() },
      {},
      { scopes: ['admin:users:list'] }
    )

    assert.equal(users.length, 2)
  })

  test('a host with no scope service simply reports none', async () => {
    const { users } = await call({ auth: auth() }, { includeRoles: true })

    assert.equal(users[0].roles, undefined)
  })
})

describe('admin listUsers — the host own columns', () => {
  test('reports the additional fields it declared', async () => {
    const auth = fakeAuth(
      [person('alice', 1, { displayName: 'Alice', avatarUrl: null })],
      {
        additionalFields: {
          displayName: { type: 'string' },
          avatarUrl: { type: 'string' },
        },
      }
    )

    const { users } = await call({ auth })

    assert.deepEqual(users[0].fields, { displayName: 'Alice' })
  })

  test('withholds one marked returned: false', async () => {
    const auth = fakeAuth([person('alice', 1, { inviteToken: 'secret' })], {
      additionalFields: { inviteToken: { type: 'string', returned: false } },
    })

    const { users } = await call({ auth })

    assert.equal(users[0].fields, undefined)
  })

  test('says nothing at all when the host declared none', async () => {
    const { users } = await call({ auth: fakeAuth([person('alice', 1)]) })

    assert.equal(users[0].fields, undefined)
  })
})
