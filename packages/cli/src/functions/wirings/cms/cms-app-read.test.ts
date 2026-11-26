import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  cliIsBuilt,
  CmsTestApp,
  type Caller,
  type Engine,
} from '../../../../test-fixtures/cms/app-harness.js'

const GRANTS = {
  nobody: [],
  admin: ['admin'],
  super: ['cms'],
  offeringReader: ['cms:offering:read'],
  offeringEditor: ['cms:offering:edit'],
  therapistReader: ['cms:therapist:read'],
  clerk: ['cms:courseApplication:read'],
  outsider: ['cms:courseApplication:read'],
}
const as = (user: keyof typeof GRANTS): Caller => ({ user })

/**
 * Rows in the form a column default stores a time, which on SQLite is not the
 * form the CMS writes. All on one day, where the two differ as text.
 */
const TIMED_SEED = `
INSERT INTO offering (id, slug, title, starts_at, updated_at) VALUES
  ('z-seed-7', 'seed-7', 'Timed', '2026-02-01 07:00:00', '2026-01-01T00:00:00.000Z'),
  ('z-seed-9', 'seed-9', 'Timed', '2026-02-01 09:00:00', '2026-01-01T00:00:00.000Z');
`

for (const engine of ['sqlite', 'postgres'] as Engine[]) {
  describe(
    `generated CMS date filters and sorts on ${engine}`,
    { skip: !cliIsBuilt() },
    () => {
      let app: CmsTestApp

      before(async () => {
        app = await CmsTestApp.create(engine)
        const tables = await app.read('db/tables.ts')
        const column = "startsAt: { type: 'timestamp' },"
        assert.ok(tables.includes(column))
        await app.write(
          'db/tables.ts',
          tables.replace(
            column,
            "startsAt: { type: 'timestamp', default: { now: true } },"
          )
        )
        const seed = `db/${engine}-dev-seed.sql`
        await app.write(seed, (await app.read(seed)) + TIMED_SEED)
        await app.build()
        await app.grant(GRANTS)
        await app.start()

        for (const [slug, startsAt] of [
          ['cms-8', '2026-02-01T08:00:00Z'],
          ['cms-9', '2026-02-01T11:00:00+02:00'],
          ['cms-10', '2026-02-01T10:00'],
        ]) {
          const made = await app.rpc(
            'createCmsOffering',
            { values: { slug, title: 'Timed', startsAt } },
            as('super')
          )
          assert.equal(made.status, 200, made.text)
        }
      })
      after(async () => {
        await app?.remove()
      })

      const slugs = async (data: object) => {
        const answer = await app.rpc('listCmsOffering', data, as('super'))
        assert.equal(answer.status, 200, answer.text)
        const found: string[] = []
        for (const { id } of answer.body.rows) {
          const record = await app.rpc('getCmsOffering', { id }, as('super'))
          found.push(record.body.row.slug)
        }
        return found
      }
      const timed = { title: { equals: 'Timed' } }
      const where = async (startsAt: object) =>
        (await slugs({ filter: [timed, { startsAt }] })).sort()
      const at = (hour: string) => `2026-02-01T${hour}:00:00Z`

      test('a range holds rows stored in either form', async () => {
        const expected: [object, string[]][] = [
          [{ gte: '2026-02-01T08:00' }, ['cms-10', 'cms-8', 'cms-9', 'seed-9']],
          [{ lte: '2026-02-01T08:00' }, ['cms-8', 'seed-7']],
          [{ gt: at('09') }, ['cms-10']],
          [{ lt: at('09') }, ['cms-8', 'seed-7']],
          [{ gte: at('07'), lt: at('08') }, ['seed-7']],
          [{ gte: '2026-02-02' }, []],
          [{ lt: '2026-02-01' }, []],
        ]
        for (const [condition, wanted] of expected) {
          assert.deepEqual(
            await where(condition),
            wanted,
            JSON.stringify(condition)
          )
        }
      })

      test('equals and in match rows stored in either form', async () => {
        assert.deepEqual(await where({ equals: at('09') }), ['cms-9', 'seed-9'])
        assert.deepEqual(await where({ equals: at('08') }), ['cms-8'])
        assert.deepEqual(await where({ equals: '2026-02-01 07:00' }), [
          'seed-7',
        ])
        assert.deepEqual(await where({ in: [at('07'), at('08'), at('09')] }), [
          'cms-8',
          'cms-9',
          'seed-7',
          'seed-9',
        ])
      })

      test('a sort is by the time, whatever form a row is stored in', async () => {
        const sorted = (direction: 'asc' | 'desc') =>
          slugs({
            filter: [timed],
            sort: [{ column: 'startsAt', direction }],
          })
        // Equal times keep the order of their keys: a made key before 'z-'.
        assert.deepEqual(await sorted('asc'), [
          'seed-7',
          'cms-8',
          'cms-9',
          'seed-9',
          'cms-10',
        ])
        assert.deepEqual(await sorted('desc'), [
          'cms-10',
          'cms-9',
          'seed-9',
          'cms-8',
          'seed-7',
        ])
      })

      test('a time the database filled in is found around it', async () => {
        const made = await app.rpc(
          'createCmsOffering',
          { values: { slug: 'by-default', title: 'Filled' } },
          as('super')
        )
        assert.equal(made.status, 200, made.text)
        const filled = Date.parse(made.body.row.startsAt)
        // Postgres `now()` in a column without a time zone is the database
        // session's own clock, which is UTC only when the session is.
        if (engine === 'sqlite') {
          assert.ok(Math.abs(Date.now() - filled) < 60_000, made.text)
        }
        const around = (offset: number) =>
          new Date(filled + offset).toISOString()
        const found = (startsAt: object) =>
          slugs({ filter: [{ title: { equals: 'Filled' } }, { startsAt }] })
        assert.deepEqual(await found({ gte: around(-1000) }), ['by-default'])
        assert.deepEqual(await found({ lte: around(1000) }), ['by-default'])
        assert.deepEqual(await found({ gt: around(1000) }), [])
        // SQLite fills whole seconds, so the time a record answers is exact.
        if (engine === 'sqlite') {
          assert.deepEqual(await found({ equals: around(0) }), ['by-default'])
        }
      })
    }
  )
}

for (const engine of ['sqlite', 'postgres'] as Engine[]) {
  describe(`generated CMS reads on ${engine}`, { skip: !cliIsBuilt() }, () => {
    let app: CmsTestApp

    before(async () => {
      app = await CmsTestApp.create(engine)
      await app.build()
      await app.grant(GRANTS)
      await app.start()
    })
    after(async () => {
      await app?.remove()
    })

    const ids = async (data: object, caller = as('super')) => {
      const answer = await app.rpc('listCmsOffering', data, caller)
      assert.equal(answer.status, 200, answer.text)
      return answer.body.rows.map((row: { id: string }) => row.id)
    }

    test('runs on the engine it names', () => {
      assert.equal(
        existsSync(join(app.dir, '.pikku-runtime/dev-postgres')),
        engine === 'postgres'
      )
      assert.equal(
        existsSync(join(app.dir, '.pikku-runtime/dev.db')),
        engine === 'sqlite'
      )
    })

    test('only a cms grant on the collection opens list and get', async () => {
      const calls: [string, object][] = [
        ['listCmsOffering', {}],
        ['getCmsOffering', { id: 'o-1' }],
        ['listCmsTherapist', {}],
        ['listCmsCourseApplication', {}],
        ['getCmsCourseApplication', { id: 'a-1' }],
      ]
      const expected: [keyof typeof GRANTS, number[]][] = [
        ['nobody', [403, 403, 403, 403, 403]],
        ['admin', [403, 403, 403, 403, 403]],
        ['super', [200, 200, 200, 200, 200]],
        ['offeringReader', [200, 200, 403, 403, 403]],
        ['offeringEditor', [403, 403, 403, 403, 403]],
        ['therapistReader', [403, 403, 200, 403, 403]],
        ['clerk', [403, 403, 403, 200, 200]],
        // Holds the scope; the app's own check says no.
        ['outsider', [403, 403, 403, 403, 403]],
      ]
      for (const [user, statuses] of expected) {
        const answers: number[] = []
        for (const [name, data] of calls) {
          answers.push((await app.rpc(name, data, as(user))).status)
        }
        assert.deepEqual(answers, statuses, user)
      }
      for (const [name, data] of calls) {
        assert.equal((await app.rpc(name, data)).status, 401, name)
      }
    })

    test('describeCms shows each caller what it may use', async () => {
      assert.equal((await app.rpc('describeCms', {})).status, 401)
      assert.equal((await app.rpc('describeCms', {}, as('nobody'))).status, 403)
      assert.equal(
        (await app.rpc('describeCms', {}, as('outsider'))).status,
        403
      )

      const reader = await app.rpc('describeCms', {}, as('offeringReader'))
      assert.equal(reader.status, 200, reader.text)
      assert.deepEqual(
        reader.body.collections.map((c: any) => [
          c.name,
          c.operations,
          Object.keys(c.functions),
        ]),
        [['offering', ['read'], ['list', 'get']]]
      )
      const [offering] = reader.body.collections
      assert.deepEqual(offering.deletesAlso, [])
      assert.ok(offering.fields.every((f: any) => !f.editable && !f.required))
      assert.ok(!offering.fields.some((f: any) => f.name === 'ownerSecret'))

      const everything = await app.rpc('describeCms', {}, as('super'))
      assert.deepEqual(
        everything.body.collections.map((c: any) => [c.name, c.operations]),
        [
          ['offering', ['read', 'create', 'edit', 'delete']],
          ['therapist', ['read', 'create', 'edit', 'delete']],
          ['courseApplication', ['read', 'edit']],
        ]
      )
      const application = everything.body.collections[2]
      assert.equal(
        application.fields.find((f: any) => f.name === 'motivation').untrusted,
        true
      )

      await app.grant({ ...GRANTS, outsider: ['cms'] })
      const narrowed = await app.rpc('describeCms', {}, as('outsider'))
      assert.deepEqual(
        narrowed.body.collections.map((c: any) => c.name),
        ['offering', 'therapist']
      )
      await app.grant(GRANTS)
    })

    test('describeCms reads the grants again, whatever a session cache holds', async () => {
      const cached = { user: 'nobody', cached: ['cms'] }
      // The cache really is replayed: a read scope is taken from the session.
      const list = await app.rpc('listCmsOffering', {}, cached)
      assert.equal(list.status, 200, list.text)
      const answer = await app.rpc('describeCms', {}, cached)
      assert.equal(answer.status, 403, answer.text)
    })

    test('the pikku dev Studio session holds cms, and a wrong token does not', async () => {
      const studio = await app.rpc('describeCms', {}, { studio: true })
      assert.equal(studio.status, 200, studio.text)
      assert.equal(studio.body.collections.length, 3)
      assert.equal(
        (await app.rpc('listCmsOffering', {}, { studio: true })).status,
        200
      )

      const wrong = await app.rpc('describeCms', {}, { studio: 'x'.repeat(64) })
      assert.equal(wrong.status, 401)
    })

    test('rows carry the declared columns and nothing else', async () => {
      const list = await app.rpc('listCmsOffering', {}, as('super'))
      assert.deepEqual(Object.keys(list.body.rows[0]).sort(), [
        'currency',
        'featured',
        'id',
        'imageKey',
        'priceMinor',
        'startsAt',
        'status',
        'title',
      ])
      const get = await app.rpc('getCmsOffering', { id: 'o-1' }, as('super'))
      assert.equal(get.status, 200, get.text)
      assert.equal(get.body.row.internalCode, 'IC-1')
      assert.equal(get.body.row.featured, true)
      assert.equal(get.body.row.priceMinor, 1000)
      assert.equal(get.body.row.position, 1)
      // Seeded without a zone, and read under a server far from UTC.
      assert.equal(get.body.row.startsAt, '2026-03-01T10:00:00.000Z')
      assert.equal(list.body.rows[0].startsAt, '2026-03-01T10:00:00.000Z')
      assert.ok(!('ownerSecret' in get.body.row))
      assert.doesNotMatch(list.text + get.text, /SENTINEL-SECRET/)
      assert.match(await app.read('db/' + engine + '-dev-seed.sql'), /SENTINEL/)
    })

    test('pages through rows that sort alike without losing or repeating one', async () => {
      const seen: string[] = []
      let cursor: string | undefined
      do {
        const answer = await app.rpc(
          'listCmsOffering',
          { limit: 2, cursor },
          as('super')
        )
        assert.equal(answer.status, 200, answer.text)
        seen.push(...answer.body.rows.map((row: any) => row.id))
        cursor = answer.body.nextCursor ?? undefined
      } while (cursor)
      assert.deepEqual(seen, ['o-1', 'o-2', 'o-3', 'o-4', 'o-5'])
    })

    test('filters and sorts on the allowed columns', async () => {
      assert.deepEqual(
        await ids({ filter: { status: { equals: 'published' } } }),
        ['o-1', 'o-2']
      )
      assert.deepEqual(
        await ids({ filter: { status: { in: ['draft', 'archived'] } } }),
        ['o-3', 'o-4', 'o-5']
      )
      assert.deepEqual(
        await ids({ filter: { priceMinor: { gt: 1000, lte: 3000 } } }),
        ['o-2', 'o-3']
      )
      assert.deepEqual(await ids({ filter: { featured: { equals: true } } }), [
        'o-1',
        'o-4',
      ])
      assert.deepEqual(
        await ids({
          filter: [
            { status: { equals: 'published' } },
            { priceMinor: { gte: 2000 } },
          ],
        }),
        ['o-2']
      )
      assert.deepEqual(
        await ids({ sort: [{ column: 'priceMinor', direction: 'desc' }] }),
        ['o-5', 'o-4', 'o-3', 'o-2', 'o-1']
      )
    })

    test('searches for the text itself, wildcards included', async () => {
      assert.deepEqual(await ids({ search: 'YOGA' }), ['o-2', 'o-3'])
      assert.deepEqual(await ids({ search: '100%' }), ['o-2'])
      assert.deepEqual(await ids({ search: 'under_' }), ['o-4'])
      assert.deepEqual(await ids({ search: "' or 1=1 --" }), [])
      assert.deepEqual(await ids({ search: '!' }), [])
    })

    test('refuses everything outside the allowlists', async () => {
      const refused: [string, object][] = [
        [
          'a filter on a column outside the list',
          { filter: { body: { equals: 'One' } } },
        ],
        [
          'a filter on an unlisted secret',
          { filter: { ownerSecret: { equals: 'x' } } },
        ],
        [
          'an operator the column does not have',
          { filter: { title: { gt: 'a' } } },
        ],
        [
          'an operator that does not exist',
          { filter: { status: { contains: 'a' } } },
        ],
        ['a column with no operator', { filter: { status: {} } }],
        [
          'two columns in one leaf',
          {
            filter: { status: { equals: 'draft' }, featured: { equals: true } },
          },
        ],
        [
          'a group of alternatives',
          { filter: { a: { status: { equals: 'draft' } } } },
        ],
        [
          'a value outside the enum',
          { filter: { status: { equals: 'gone' } } },
        ],
        ['a value of another type', { filter: { priceMinor: { gt: '1000' } } }],
        [
          'a number the column cannot hold',
          { filter: { priceMinor: { gt: 3000000000 } } },
        ],
        ['a date that is none', { filter: { startsAt: { gt: '2026-13-45' } } }],
        ['an empty list of values', { filter: { status: { in: [] } } }],
        [
          'a sort on another column',
          { sort: [{ column: 'body', direction: 'asc' }] },
        ],
        [
          'a sort with SQL in it',
          {
            sort: [{ column: 'title', direction: 'asc; drop table offering' }],
          },
        ],
        ['a page of more than 100', { limit: 101 }],
        ['a cursor that is no offset', { cursor: '-1' }],
        ['an unknown input', { columns: ['ownerSecret'] }],
      ]
      for (const [what, data] of refused) {
        const answer = await app.rpc('listCmsOffering', data, as('super'))
        assert.equal(answer.status, 422, `${what}: ${answer.text}`)
      }
      const extra = await app.rpc(
        'getCmsOffering',
        { id: 'o-1', select: '*' },
        as('super')
      )
      assert.equal(extra.status, 422, extra.text)
      const missing = await app.rpc(
        'getCmsOffering',
        { id: 'none' },
        as('super')
      )
      assert.equal(missing.status, 404, missing.text)
    })

    test('a collection that is taken out leaves no function behind', async () => {
      const original = await app.read('db/cms.ts')
      const start = original.indexOf('  courseApplication: {')
      const end = original.lastIndexOf('})')
      await app.write(
        'db/cms.ts',
        original.slice(0, start) + original.slice(end)
      )
      await app.strictBuild()
      assert.doesNotMatch(
        await app.read('src/scaffold/cms/cms.gen.ts'),
        /CourseApplication/
      )
      await app.write('db/cms.ts', original)
      await app.strictBuild()
    })
  })
}
