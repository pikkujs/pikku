import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
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
  reader: ['cms:offering:read'],
  // Each write without the read every write also needs.
  blindWriter: [
    'cms:offering:create',
    'cms:offering:edit',
    'cms:offering:delete',
  ],
  creator: ['cms:offering:read', 'cms:offering:create'],
  editor: ['cms:offering:read', 'cms:offering:edit'],
  deleter: ['cms:offering:read', 'cms:offering:delete'],
  offerings: ['cms:offering'],
  therapists: ['cms:therapist'],
  clerk: ['cms:courseApplication'],
  outsider: ['cms'],
}
const as = (user: keyof typeof GRANTS): Caller => ({ user })

for (const engine of ['sqlite', 'postgres'] as Engine[]) {
  describe(`generated CMS writes on ${engine}`, { skip: !cliIsBuilt() }, () => {
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

    const ok = async (name: string, data: object, caller = as('super')) => {
      const answer = await app.rpc(name, data, caller)
      assert.equal(answer.status, 200, `${name}: ${answer.text}`)
      return answer.body
    }
    const refusedWith = async (
      status: number,
      name: string,
      data: object,
      what = name,
      caller = as('super')
    ) => {
      const answer = await app.rpc(name, data, caller)
      assert.equal(answer.status, status, `${what}: ${answer.text}`)
      // A refusal never repeats what the database said.
      assert.doesNotMatch(
        answer.text,
        /constraint|SQLITE|insert into|SENTINEL/i,
        what
      )
      return answer
    }

    let slugs = 0
    const values = (extra: object = {}) => ({
      slug: `new-${++slugs}`,
      title: 'New offering',
      ...extra,
    })
    const create = async (extra: object = {}) =>
      (await ok('createCmsOffering', { values: values(extra) })).row
    const get = async (id: string) => (await ok('getCmsOffering', { id })).row
    const everyOffering = async () =>
      (await ok('listCmsOffering', { limit: 100 })).rows

    test('each write needs read and its own grant on the collection', async () => {
      // 404 is a caller who was let in and named a record that is not there.
      const attempt = async (caller: Caller) => [
        (await app.rpc('createCmsOffering', { values: values() }, caller))
          .status,
        (
          await app.rpc(
            'updateCmsOffering',
            { id: 'none', patch: { title: 'x' } },
            caller
          )
        ).status,
        (await app.rpc('deleteCmsOffering', { id: 'none' }, caller)).status,
      ]
      const expected: [keyof typeof GRANTS, number[]][] = [
        ['nobody', [403, 403, 403]],
        ['admin', [403, 403, 403]],
        ['reader', [403, 403, 403]],
        ['blindWriter', [403, 403, 403]],
        ['therapists', [403, 403, 403]],
        ['creator', [200, 403, 403]],
        ['editor', [403, 404, 403]],
        ['deleter', [403, 403, 404]],
        ['offerings', [200, 404, 404]],
        ['super', [200, 404, 404]],
      ]
      const before = (await everyOffering()).length
      for (const [user, statuses] of expected) {
        assert.deepEqual(await attempt(as(user)), statuses, user)
      }
      assert.deepEqual(await attempt({}), [401, 401, 401])
      assert.equal(
        (await everyOffering()).length,
        before + expected.filter(([, [made]]) => made === 200).length
      )
    })

    test("a write also needs the app's read check", async () => {
      const data = { id: 'a-1', patch: { status: 'accepted' } }
      await refusedWith(
        403,
        'updateCmsCourseApplication',
        data,
        'outsider',
        as('outsider')
      )
      await ok('updateCmsCourseApplication', data, as('clerk'))
    })

    test('a revoked write grant counts at once, whatever a session cache holds', async () => {
      const cached = { user: 'nobody', cached: ['cms'] }
      // The cache really is replayed: a read scope is taken from the session.
      await ok('listCmsOffering', {}, cached)
      const calls: [string, object][] = [
        ['createCmsOffering', { values: values() }],
        ['updateCmsOffering', { id: 'o-1', patch: { title: 'Revoked' } }],
        ['deleteCmsOffering', { id: 'o-5' }],
      ]
      for (const [name, data] of calls) {
        await refusedWith(403, name, data, name, cached)
      }
      assert.equal((await get('o-1')).title, 'Breath work')
      await get('o-5')
    })

    test('creates with a server key, the defaults and a version', async () => {
      const row = await create({
        status: 'published',
        body: '**bold**\n\n<b>kept as written</b>  \n',
        priceMinor: 1500,
        featured: true,
        position: 7,
        therapistId: 't-ada',
        startsAt: '2026-06-01T14:00:00+02:00',
        salesUrl: 'https://example.com/buy',
      })
      assert.match(row.id, /^[0-9a-f-]{36}$/)
      assert.equal(row.currency, 'EUR')
      assert.equal(row.internalCode, 'none')
      assert.equal(row.body, '**bold**\n\n<b>kept as written</b>  \n')
      assert.equal(row.featured, true)
      assert.equal(row.startsAt, '2026-06-01T12:00:00.000Z')
      assert.match(row.updatedAt, /^\d{4}-\d{2}-\d{2}T/)
      assert.deepEqual(await get(row.id), row)

      const bare = await create()
      assert.deepEqual(
        [bare.status, bare.featured, bare.priceMinor, bare.position],
        ['draft', false, 0, null]
      )
    })

    test('a time that names no zone is UTC, and survives a round trip', async () => {
      const row = await create({ startsAt: '2026-06-01T12:00' })
      assert.equal(row.startsAt, '2026-06-01T12:00:00.000Z')
      const again = await ok('updateCmsOffering', {
        id: row.id,
        patch: { startsAt: row.startsAt },
      })
      assert.equal(again.row.startsAt, '2026-06-01T12:00:00.000Z')
      const found = await ok('listCmsOffering', {
        filter: { startsAt: { equals: '2026-06-01T12:00:00Z' } },
      })
      assert.ok(found.rows.some((r: any) => r.id === row.id))
    })

    const BAD_VALUES: [string, object][] = [
      ['the key', { id: 'chosen' }],
      ['a column set by the server', { internalCode: 'mine' }],
      ['a secret column', { ownerSecret: 'mine' }],
      ['the version', { updatedAt: '2026-01-01T00:00:00.000Z' }],
      ['a column that does not exist', { admin: true }],
      ['a null the column does not take', { title: null }],
      ['text of another type', { title: 5 }],
      ['an empty title', { title: '' }],
      ['a title over its length', { title: 'x'.repeat(201) }],
      ['a slug over its length', { slug: 'x'.repeat(81) }],
      ['a body over its length', { body: 'x'.repeat(20001) }],
      ['a NUL character', { title: 'a\u0000b' }],
      ['a value outside the enum', { status: 'gone' }],
      ['a price under its minimum', { priceMinor: -1 }],
      ['a price with a fraction', { priceMinor: 1.5 }],
      ['a number the column cannot hold', { position: 3000000000 }],
      ['a truth that is a string', { featured: 'true' }],
      ['a time that is none', { startsAt: 'tomorrow' }],
      ['a day that does not exist', { startsAt: '2026-02-31T10:00:00Z' }],
      ['a script link', { salesUrl: 'javascript:alert(1)' }],
      ['a data link', { salesUrl: 'data:text/html,<script></script>' }],
      ['something that is no link', { salesUrl: 'checkout' }],
      ['an image key the caller made up', { imageKey: '../../etc/passwd' }],
    ]

    test('refuses bad input to a create and a patch, and stores nothing', async () => {
      const before = await everyOffering()
      const record = await get('o-1')
      for (const [what, bad] of BAD_VALUES) {
        await refusedWith(
          422,
          'createCmsOffering',
          { values: values(bad) },
          `create with ${what}`
        )
        await refusedWith(
          422,
          'updateCmsOffering',
          { id: 'o-1', patch: bad },
          `patch with ${what}`
        )
      }
      await refusedWith(422, 'createCmsOffering', { values: { slug: 'only' } })
      await refusedWith(422, 'createCmsOffering', {
        values: values(),
        id: 'chosen',
      })
      await refusedWith(422, 'updateCmsOffering', { id: 'o-1', patch: {} })
      await refusedWith(422, 'updateCmsOffering', {
        id: 'o-1',
        patch: { title: 'x' },
        where: '1=1',
      })
      await refusedWith(422, 'deleteCmsOffering', { id: 'o-1', force: true })
      assert.deepEqual(await everyOffering(), before)
      assert.deepEqual(await get('o-1'), record)
    })

    test('changes only the fields the patch names', async () => {
      const row = await create({ body: 'Keep', position: 3 })
      const { row: changed } = await ok('updateCmsOffering', {
        id: row.id,
        patch: { title: 'Renamed' },
      })
      assert.deepEqual(
        { ...changed, updatedAt: row.updatedAt },
        { ...row, title: 'Renamed' }
      )
      assert.notEqual(changed.updatedAt, row.updatedAt)
      const { row: cleared } = await ok('updateCmsOffering', {
        id: row.id,
        patch: { body: null },
      })
      assert.deepEqual([cleared.body, cleared.position], [null, 3])
    })

    test('what a visitor submitted cannot be changed', async () => {
      for (const patch of [
        { email: 'other@example.com' },
        { motivation: 'edited' },
        { createdAt: '2026-01-01T00:00:00Z' },
      ]) {
        await refusedWith(422, 'updateCmsCourseApplication', {
          id: 'a-1',
          patch,
        })
      }
      const { row } = await ok(
        'updateCmsCourseApplication',
        { id: 'a-1', patch: { status: 'rejected', note: 'No place left' } },
        as('clerk')
      )
      assert.equal(row.motivation, '<script>alert(1)</script>')
      assert.equal(row.note, 'No place left')
      assert.equal(
        (await app.rpc('createCmsCourseApplication', {}, as('super'))).status,
        404
      )
      assert.equal(
        (await app.rpc('deleteCmsCourseApplication', {}, as('super'))).status,
        404
      )
    })

    test('an update that expects an older version is a conflict', async () => {
      const seeded = await get('o-2')
      const { row } = await ok('updateCmsOffering', {
        id: 'o-2',
        patch: { title: 'First' },
        expectedUpdatedAt: seeded.updatedAt,
      })
      await refusedWith(409, 'updateCmsOffering', {
        id: 'o-2',
        patch: { title: 'Second' },
        expectedUpdatedAt: seeded.updatedAt,
      })
      assert.equal((await get('o-2')).title, 'First')
      await refusedWith(404, 'updateCmsOffering', {
        id: 'none',
        patch: { title: 'x' },
        expectedUpdatedAt: row.updatedAt,
      })
    })

    test("a write that lands between an update's check and its write is not lost", async () => {
      const row = await create()
      await app.write('interleave', row.id)
      await refusedWith(409, 'updateCmsOffering', {
        id: row.id,
        patch: { title: 'Mine' },
        expectedUpdatedAt: row.updatedAt,
      })
      // It did land in between, and the file says so.
      assert.equal(await app.read('interleaved'), row.id)
      assert.equal((await get(row.id)).title, 'Another editor')
    })

    test('what the database refuses is the caller to fix', async () => {
      const row = await create()
      await refusedWith(409, 'createCmsOffering', {
        values: values({ slug: row.slug }),
      })
      await refusedWith(409, 'updateCmsOffering', {
        id: row.id,
        patch: { slug: 'breath' },
      })
      await refusedWith(422, 'createCmsOffering', {
        values: values({ therapistId: 'nobody' }),
      })
      // An offering refers to this therapist, and the reference restricts.
      await refusedWith(409, 'deleteCmsTherapist', { id: 't-ada' })
      assert.equal(
        (await ok('getCmsTherapist', { id: 't-ada' })).row.name,
        'Ada'
      )
    })

    test('deletes the one record', async () => {
      const row = await create()
      const count = (await everyOffering()).length
      assert.deepEqual(await ok('deleteCmsOffering', { id: row.id }), {
        removed: true,
      })
      assert.equal((await everyOffering()).length, count - 1)
      await refusedWith(404, 'getCmsOffering', { id: row.id })
      await refusedWith(404, 'deleteCmsOffering', { id: row.id })
    })

    test('records each change by field name, never by value', async () => {
      const start = (await app.audited()).length
      const row = await create({ title: 'PRIVATE-TITLE' })
      await ok('updateCmsOffering', {
        id: row.id,
        patch: { body: 'PRIVATE-BODY' },
      })
      await ok(
        'updateCmsCourseApplication',
        { id: 'a-1', patch: { note: 'PRIVATE-NOTE' } },
        as('clerk')
      )
      await ok('deleteCmsOffering', { id: row.id })
      // Refused, so there is nothing to record.
      await refusedWith(422, 'updateCmsOffering', { id: 'o-1', patch: {} })
      await refusedWith(409, 'createCmsOffering', {
        values: values({ slug: 'breath' }),
      })

      let events: any[] = []
      for (let wait = 0; wait < 50 && events.length < 4; wait++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        events = (await app.audited()).slice(start)
      }
      assert.deepEqual(
        events.map((e) => [e.type, e.userIdentity?.userId, e.metadata]),
        [
          [
            'cms.record.created',
            'super',
            {
              collection: 'offering',
              id: row.id,
              fields: ['slug', 'title'],
            },
          ],
          [
            'cms.record.updated',
            'super',
            { collection: 'offering', id: row.id, fields: ['body'] },
          ],
          [
            'cms.record.updated',
            'clerk',
            { collection: 'courseApplication', id: 'a-1', fields: ['note'] },
          ],
          [
            'cms.record.deleted',
            'super',
            { collection: 'offering', id: row.id, fields: [] },
          ],
        ]
      )
      assert.doesNotMatch(JSON.stringify(await app.audited()), /PRIVATE-/)
    })

    test('describeCms names the writes a caller holds', async () => {
      const operations = async (user: keyof typeof GRANTS) => {
        const { collections } = await ok('describeCms', {}, as(user))
        const offering = collections.find((c: any) => c.name === 'offering')
        return [
          offering.operations,
          Object.keys(offering.functions),
          offering.fields.some((f: any) => f.editable),
          offering.fields.some((f: any) => f.required),
        ]
      }
      assert.deepEqual(await operations('creator'), [
        ['read', 'create'],
        ['list', 'get', 'create'],
        true,
        true,
      ])
      assert.deepEqual(await operations('editor'), [
        ['read', 'edit'],
        ['list', 'get', 'update'],
        true,
        false,
      ])
      assert.deepEqual(await operations('deleter'), [
        ['read', 'delete'],
        ['list', 'get', 'delete'],
        false,
        false,
      ])
    })
  })
}
