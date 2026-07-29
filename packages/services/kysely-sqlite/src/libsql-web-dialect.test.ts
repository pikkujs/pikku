import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Kysely } from 'kysely'
import { LibsqlWebDialect } from './libsql-web-dialect.js'

interface TestDB {
  entry: {
    id: string
    createdAt: string
    payload: string
    archived: number
  }
}

/** Args of the last `execute` request the dialect put on the wire. */
let sentArgs: Array<Record<string, unknown>>
let realFetch: typeof globalThis.fetch

const okResponse = () =>
  new Response(
    JSON.stringify({
      baton: null,
      base_url: null,
      results: [
        {
          type: 'ok',
          response: {
            type: 'execute',
            result: {
              cols: [],
              rows: [],
              affected_row_count: 1,
              last_insert_rowid: '1',
            },
          },
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )

const db = () =>
  new Kysely<TestDB>({
    dialect: new LibsqlWebDialect({ url: 'https://example.turso.io' }),
  })

describe('LibsqlWebDialect bind-parameter encoding', () => {
  beforeEach(() => {
    sentArgs = []
    realFetch = globalThis.fetch
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      for (const req of body.requests) {
        if (req.type === 'execute') sentArgs = req.stmt.args
      }
      return okResponse()
    }) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test('encodes a Date as an ISO-8601 text value', async () => {
    const createdAt = new Date('2026-07-29T21:00:00.000Z')
    await db()
      .insertInto('entry')
      .values({ id: 'a', createdAt: createdAt as never } as never)
      .execute()

    assert.deepEqual(sentArgs[1], {
      type: 'text',
      value: '2026-07-29T21:00:00.000Z',
    })
  })

  test('encodes a plain object and an array as JSON text', async () => {
    await db()
      .insertInto('entry')
      .values({ id: 'a', payload: { tags: [1, 2] } as never } as never)
      .execute()

    assert.deepEqual(sentArgs[1], {
      type: 'text',
      value: '{"tags":[1,2]}',
    })
  })

  test('keeps the primitive encodings intact', async () => {
    await db()
      .insertInto('entry')
      .values({ id: 'a', archived: true as never } as never)
      .execute()

    assert.deepEqual(sentArgs, [
      { type: 'text', value: 'a' },
      { type: 'integer', value: '1' },
    ])
  })

  test('still rejects a value it cannot represent', async () => {
    await assert.rejects(
      db()
        .insertInto('entry')
        .values({ id: 'a', payload: Symbol('nope') as never } as never)
        .execute(),
      /unsupported argument type symbol/
    )
  })
})
