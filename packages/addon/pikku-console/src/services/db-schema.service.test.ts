import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { DbSchemaService } from './db-schema.service.js'

const SCHEMA = {
  tables: [
    {
      name: 'question',
      columns: [
        { name: 'body', type: 'TEXT', nullable: false, isPrimaryKey: false },
        {
          name: 'attendee_id',
          type: 'TEXT',
          nullable: false,
          isPrimaryKey: false,
        },
      ],
    },
  ],
  enums: [],
}

const makeMetaService = (annotations: unknown) => ({
  readFile: async (path: string) => {
    if (path === 'db/pikku-db-schema.gen.json') return JSON.stringify(SCHEMA)
    if (path === 'db/annotations.gen.json') return JSON.stringify(annotations)
    return null
  },
})

const classifications = async (annotations: unknown) => {
  const service = new DbSchemaService(makeMetaService(annotations) as never)
  const schema = await service.getSchema()
  return Object.fromEntries(
    schema!.tables[0]!.columns.map((c) => [c.name, c.classification])
  )
}

describe('DbSchemaService.getSchema', () => {
  test('reads the privacy level from `security`, as annotations.gen.json writes it', async () => {
    // The sidecar holds the column annotations of db/tables.ts as written, so
    // this is the shape a project actually has. Reading the wrong key here is invisible: every
    // column silently falls back to `private` and the console looks like it is
    // working.
    assert.deepEqual(
      await classifications({
        question: {
          body: { security: 'public' },
          attendee_id: { security: 'private', classification: 'hash' },
        },
      }),
      { body: 'public', attendee_id: 'private' }
    )
  })

  test('still reads `visibility` from a sidecar an older CLI generated', async () => {
    assert.deepEqual(
      await classifications({
        question: {
          body: { visibility: 'public' },
          attendee_id: { visibility: 'pii', classification: 'hash' },
        },
      }),
      { body: 'public', attendee_id: 'pii' }
    )
  })

  test('never reads the privacy level out of `classification`, which is the anonymize strategy', async () => {
    // `classification: 'hash'` means "hash this when anonymizing", not a level.
    // An unannotated column is `private` — the safe default, not the loud one.
    assert.deepEqual(
      await classifications({
        question: {
          body: { classification: 'fake:name' },
          attendee_id: {},
        },
      }),
      { body: 'private', attendee_id: 'private' }
    )
  })
})

describe('DbSchemaService constraints', () => {
  test('carries declared constraints to the column, and none to others', async () => {
    const service = new DbSchemaService(
      makeMetaService({
        question: {
          body: { security: 'public', minLength: 1, maxLength: 500 },
          attendee_id: { security: 'private' },
        },
      }) as never
    )
    const columns = (await service.getSchema())!.tables[0]!.columns
    assert.deepEqual(columns[0]!.constraints, { minLength: 1, maxLength: 500 })
    assert.equal(columns[1]!.constraints, undefined)
  })
})
