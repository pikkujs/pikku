import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { crc32 } from 'node:zlib'
import { FFMPEG_AVIF, IMAGES } from '../../../../test-fixtures/crud/images.js'
import {
  cliIsBuilt,
  CrudTestApp,
  type Caller,
  type Engine,
} from '../../../../test-fixtures/crud/app-harness.js'

const OFFERINGS = 'crud:offering'
const READS = ['crud:offering:read', 'crud:therapist:read']

const GRANTS = {
  nobody: [],
  super: ['crud'],
  reader: ['crud:offering:read'],
  creator: ['crud:offering:read', 'crud:offering:create'],
  editor: ['crud:offering:read', 'crud:offering:edit'],
  blindWriter: ['crud:offering:create', 'crud:offering:edit'],
  // Every offering grant, and nothing on therapists.
  offerings: [OFFERINGS],
  linker: [OFFERINGS, 'crud:therapist:read'],
  both: READS,
  therapists: ['crud:therapist:read'],
  // Hold the scopes, and an app check says no.
  stranger: ['crud'],
  trainee: ['crud'],
}
const as = (user: keyof typeof GRANTS): Caller => ({ user })

const PNG = IMAGES['image/png']

for (const engine of ['sqlite', 'postgres'] as Engine[]) {
  describe(
    `generated CRUD relations with and without a read check on ${engine}`,
    { skip: !cliIsBuilt() },
    () => {
      let app: CrudTestApp
      let built: string | undefined

      before(async () => {
        app = await CrudTestApp.create(engine)
        const edit = async (path: string, after: string, added: string) => {
          const source = await app.read(path)
          assert.ok(source.includes(after), after)
          await app.write(path, source.replace(after, after + added))
        }
        // Therapists have a read check of the app's own; offerings have none.
        await edit(
          'db/tables.ts',
          "therapistId: { type: 'key', references: 'therapist.id' },",
          "\n      parentId: { type: 'key', references: 'offering.id' },"
        )
        await edit(
          'db/crud.ts',
          "therapistId: 'relation',",
          "\n      parentId: 'relation',"
        )
        try {
          await app.build()
          await app.grant(GRANTS)
          await app.start()
        } catch (error: any) {
          built = String(error.message)
        }
      })
      after(async () => {
        await app?.remove()
      })

      test('the app builds with type checking', () => {
        assert.equal(built, undefined)
      })

      test('create and update link to both targets, each behind its own read', async () => {
        const create = (slug: string, caller: Caller) =>
          app.rpc(
            'createCrudOffering',
            {
              values: {
                slug,
                title: 'Two links',
                therapistId: 't-ada',
                parentId: 'o-1',
              },
            },
            caller
          )
        const made = await create('two-links', as('linker'))
        assert.equal(made.status, 200, made.text)
        assert.deepEqual(
          [made.body.row.therapistId, made.body.row.parentId],
          ['t-ada', 'o-1']
        )
        const update = (patch: object, user: keyof typeof GRANTS) =>
          app.rpc(
            'updateCrudOffering',
            { id: made.body.row.id, patch },
            as(user)
          )
        const moved = await update({ parentId: 'o-3' }, 'offerings')
        assert.equal(moved.status, 200, moved.text)
        assert.equal(moved.body.row.parentId, 'o-3')
        assert.equal(
          (await update({ therapistId: 't-bo' }, 'offerings')).status,
          403
        )
        assert.equal(
          (await update({ therapistId: 't-bo' }, 'linker')).status,
          200
        )
        assert.equal(
          (await update({ parentId: 'no-such' }, 'linker')).status,
          422
        )
        assert.equal((await create('no-link', as('offerings'))).status, 403)
      })
    }
  )
}

for (const engine of ['sqlite', 'postgres'] as Engine[]) {
  describe(
    `generated CRUD relations and images on ${engine}`,
    { skip: !cliIsBuilt() },
    () => {
      let app: CrudTestApp

      before(async () => {
        app = await CrudTestApp.create(engine)
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
      const status = async (name: string, data: object, caller: Caller) =>
        (await app.rpc(name, data, caller)).status

      let slugs = 0
      const values = (extra: object = {}) => ({
        slug: `file-${++slugs}`,
        title: 'With a file',
        ...extra,
      })
      const get = async (id: string) =>
        (await ok('getCrudOffering', { id })).row

      const UPLOAD = 'createCrudOfferingImageKeyUpload'
      const asked = (extra: object = {}) => ({
        for: 'create',
        contentType: 'image/png',
        byteLength: PNG.length,
        ...extra,
      })
      /** Straight to the app, with the URL as the only grant. */
      const put = (url: string, body: Buffer | string) =>
        fetch(new URL(url, app.url), {
          method: 'PUT',
          headers: { 'content-type': 'image/png' },
          body: typeof body === 'string' ? body : new Uint8Array(body),
        })
      const uploaded = async (body: Buffer | string = PNG) => {
        const upload = await ok(UPLOAD, asked())
        const sent = await put(upload.uploadUrl, body)
        assert.equal(sent.status, 200, await sent.text())
        return upload.fileKey as string
      }
      const madeUpKey = () => `crud/offering/imageKey/${randomUUID()}.png`

      test('choosing a related record needs the read of both collections', async () => {
        const name = 'searchCrudOfferingTherapistIdOptions'
        const expected: [keyof typeof GRANTS, number][] = [
          ['nobody', 403],
          ['reader', 403],
          ['offerings', 403],
          ['therapists', 403],
          ['both', 200],
          ['stranger', 403],
          ['super', 200],
        ]
        for (const [user, wanted] of expected) {
          assert.equal(await status(name, {}, as(user)), wanted, user)
        }
        assert.equal(await status(name, {}, {}), 401)
      })

      test('related records answer as ids and titles', async () => {
        const name = 'searchCrudOfferingTherapistIdOptions'
        assert.deepEqual(await ok(name, {}), {
          rows: [
            { id: 't-ada', label: 'Ada' },
            { id: 't-bo', label: 'Bo' },
          ],
        })
        assert.deepEqual((await ok(name, { search: 'AD' })).rows, [
          { id: 't-ada', label: 'Ada' },
        ])
        assert.deepEqual((await ok(name, { search: '%' })).rows, [])
        assert.deepEqual((await ok(name, { ids: ['t-bo', 'none'] })).rows, [
          { id: 't-bo', label: 'Bo' },
        ])
        assert.equal((await ok(name, { limit: 1 })).rows.length, 1)
        for (const bad of [{ limit: 101 }, { ids: [] }, { column: 'id' }]) {
          assert.equal(await status(name, bad, as('super')), 422)
        }
      })

      test('linking needs the read of the target, and tells nothing without it', async () => {
        const link = (id: string, therapistId: string | null, user: any) =>
          status('updateCrudOffering', { id, patch: { therapistId } }, as(user))
        for (const user of ['offerings', 'stranger'] as const) {
          // The same answer whether or not the record is there.
          assert.equal(await link('o-3', 't-ada', user), 403, user)
          assert.equal(await link('o-3', 'no-such', user), 403, user)
          assert.equal(
            await status(
              'createCrudOffering',
              { values: values({ therapistId: 't-ada' }) },
              as(user)
            ),
            403,
            user
          )
        }
        assert.equal((await get('o-3')).therapistId, null)
        // What does not link stays open to them.
        assert.equal(
          await status(
            'updateCrudOffering',
            { id: 'o-3', patch: { position: 9 } },
            as('offerings')
          ),
          200
        )
        assert.equal(await link('o-3', null, 'offerings'), 200)

        assert.equal(await link('o-3', 'no-such', 'linker'), 422)
        assert.equal(await link('o-3', 't-bo', 'linker'), 200)
        assert.equal((await get('o-3')).therapistId, 't-bo')
        assert.equal(
          await status(
            'createCrudOffering',
            { values: values({ therapistId: 'no-such' }) },
            as('linker')
          ),
          422
        )
      })

      test('describeCrud offers what a caller can use', async () => {
        const offering = async (user: keyof typeof GRANTS) => {
          const { collections } = await ok('describeCrud', {}, as(user))
          const found = collections.find((c: any) => c.name === 'offering')
          const field = (name: string) =>
            found.fields.find((f: any) => f.name === name)
          return [
            found.operations,
            field('imageKey').uploadFunction ?? null,
            field('therapistId').optionsFunction ?? null,
          ]
        }
        assert.deepEqual(await offering('reader'), [['read'], null, null])
        assert.deepEqual(await offering('editor'), [
          ['read', 'edit'],
          UPLOAD,
          null,
        ])
        assert.deepEqual(await offering('linker'), [
          ['read', 'create', 'edit', 'delete'],
          UPLOAD,
          'searchCrudOfferingTherapistIdOptions',
        ])
        assert.deepEqual((await offering('trainee'))[0], [
          'read',
          'edit',
          'delete',
        ])
      })

      test('an upload URL needs the grant of what it is for', async () => {
        const attempt = async (caller: Caller) => [
          await status(UPLOAD, asked({ for: 'create' }), caller),
          await status(UPLOAD, asked({ for: 'edit' }), caller),
        ]
        const expected: [keyof typeof GRANTS, number[]][] = [
          ['nobody', [403, 403]],
          ['reader', [403, 403]],
          ['blindWriter', [403, 403]],
          ['therapists', [403, 403]],
          ['creator', [200, 403]],
          ['editor', [403, 200]],
          ['offerings', [200, 200]],
          // The app's check on creating covers the upload for a new record.
          ['trainee', [403, 200]],
        ]
        for (const [user, statuses] of expected) {
          assert.deepEqual(await attempt(as(user)), statuses, user)
        }
        assert.deepEqual(await attempt({}), [401, 401])
        assert.equal(
          await status(
            'createCrudOffering',
            { values: values() },
            as('trainee')
          ),
          403
        )
      })

      test('a revoked grant gets no upload URL, whatever a session cache holds', async () => {
        const cached = { user: 'nobody', cached: ['crud'] }
        // The cache really is replayed: a read scope is taken from the session.
        await ok('listCrudOffering', {}, cached)
        for (const operation of ['create', 'edit']) {
          assert.equal(
            await status(UPLOAD, asked({ for: operation }), cached),
            403
          )
        }
        // Revoked write, read kept.
        const readerNow = { user: 'reader', cached: ['crud:offering'] }
        assert.equal(await status(UPLOAD, asked(), readerNow), 403)
      })

      test('an upload URL is only for the types and sizes the field takes', async () => {
        for (const bad of [
          { contentType: 'text/html' },
          { contentType: 'image/svg+xml' },
          { contentType: 'image/gif' },
          { byteLength: 2001 },
          { byteLength: 0 },
          { byteLength: 1.5 },
          { for: 'delete' },
          { fileKey: 'mine.png' },
          { bucket: 'other' },
        ]) {
          assert.equal(
            await status(UPLOAD, asked(bad), as('super')),
            422,
            JSON.stringify(bad)
          )
        }
        const upload = await ok(UPLOAD, asked({ byteLength: 2000 }))
        assert.match(
          upload.fileKey,
          /^crud\/offering\/imageKey\/[0-9a-f-]{36}\.png$/
        )
        assert.equal(upload.uploadMethod, 'PUT')
      })

      test('a file goes straight to the app, is saved by its key and shown by a signed link', async () => {
        const key = await uploaded()
        const { row } = await ok('createCrudOffering', {
          values: values({ imageKey: key }),
        })
        assert.equal(row.imageKey, key)
        const { previewUrls } = await ok('getCrudOffering', { id: row.id })
        const shown = await fetch(new URL(previewUrls.imageKey, app.url))
        assert.equal(shown.status, 200)
        assert.deepEqual(Buffer.from(await shown.arrayBuffer()), PNG)
        const unsigned = new URL(previewUrls.imageKey, app.url)
        unsigned.search = ''
        assert.equal((await fetch(unsigned)).status, 403)

        const list = await ok('listCrudOffering', {
          filter: { title: { equals: 'With a file' } },
        })
        assert.equal(list.rows[0].imageKey, key)

        const cleared = await ok('updateCrudOffering', {
          id: row.id,
          patch: { imageKey: null },
        })
        assert.equal(cleared.row.imageKey, null)
        assert.deepEqual(
          (await ok('getCrudOffering', { id: row.id })).previewUrls,
          { imageKey: null }
        )
      })

      test('a record takes only the key of a file that was uploaded for the field', async () => {
        const record = await get('o-1')
        const count = (await ok('listCrudOffering', { limit: 100 })).rows.length
        const neverSent = (await ok(UPLOAD, asked())).fileKey
        const real = await uploaded()
        const refused: [string, string][] = [
          ['a key nothing was sent to', neverSent],
          ['a well formed key of its own', madeUpKey()],
          ['part of a real key', real.slice(0, -1)],
          [
            'another field',
            real.replace('offering/imageKey', 'therapist/name'),
          ],
          ['a path out of the prefix', `crud/offering/imageKey/../../x.png`],
          ['an address', 'https://example.com/a.png'],
          ['a type the field does not take', real.replace('.png', '.gif')],
        ]
        for (const [what, imageKey] of refused) {
          assert.equal(
            await status(
              'updateCrudOffering',
              { id: 'o-1', patch: { imageKey } },
              as('super')
            ),
            422,
            what
          )
          assert.equal(
            await status(
              'createCrudOffering',
              { values: values({ imageKey }) },
              as('super')
            ),
            422,
            what
          )
        }
        assert.deepEqual(await get('o-1'), record)
        assert.equal(
          (await ok('listCrudOffering', { limit: 100 })).rows.length,
          count
        )
        await ok('updateCrudOffering', { id: 'o-1', patch: { imageKey: real } })
      })

      test('a value no CRUD write stored gets no signed link', async () => {
        const { row, previewUrls } = await ok('getCrudOffering', { id: 'o-4' })
        assert.equal(row.imageKey, 'legacy/photo.png')
        assert.deepEqual(previewUrls, { imageKey: null })
      })

      test('the upload route takes only the path it signed, within the size limit', async () => {
        const upload = await ok(UPLOAD, asked())
        const unsigned = new URL(upload.uploadUrl, app.url)
        unsigned.search = ''
        assert.equal((await put(unsigned.href, PNG)).status, 403)
        const moved = upload.uploadUrl.replace(upload.fileKey, madeUpKey())
        assert.notEqual(moved, upload.uploadUrl)
        assert.equal((await put(moved, PNG)).status, 403)
        assert.equal(
          (await put(upload.uploadUrl, Buffer.alloc(1_100_000))).status,
          413
        )
      })

      /** A real PNG made exactly `length` bytes by a text chunk before its end. */
      const pngOf = (length: number) => {
        const filler = length - PNG.length - 12
        const chunk = Buffer.alloc(filler + 12)
        chunk.writeUInt32BE(filler, 0)
        chunk.write('tEXtc\0', 4, 'latin1')
        chunk.fill('x', 10, 8 + filler)
        chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + filler)), 8 + filler)
        return Buffer.concat([PNG.subarray(0, -12), chunk, PNG.subarray(-12)])
      }
      /** Upload as `contentType`, whatever the bytes are, and answer the key. */
      const uploadedAs = async (contentType: string, body: Buffer | string) => {
        const upload = await ok(UPLOAD, asked({ contentType }))
        const sent = await put(upload.uploadUrl, body)
        assert.equal(sent.status, 200, await sent.text())
        return upload.fileKey as string
      }
      /** The statuses of saving a key by a create and by an update. */
      const save = async (imageKey: string) => {
        const created = await app.rpc(
          'createCrudOffering',
          { values: values({ imageKey }) },
          as('super')
        )
        const updated = await app.rpc(
          'updateCrudOffering',
          { id: 'o-2', patch: { imageKey } },
          as('super')
        )
        return [created, updated] as const
      }

      // `getUploadURL` carries neither the type nor the size to the upload
      // route, so the stored file is checked when a record is to take it.
      test('a file that is not the image it was uploaded as is not saved', async () => {
        const before = await get('o-2')
        const count = (await ok('listCrudOffering', { limit: 100 })).rows.length
        const html = Buffer.from('<script>alert(1)</script>')
        const jpeg = IMAGES['image/jpeg']
        const webp = IMAGES['image/webp']
        const half = (bytes: Buffer) => bytes.subarray(0, bytes.length >> 1)
        const cases: [string, string, Buffer, RegExp][] = [
          ['HTML as a PNG', 'image/png', html, /not a complete image/],
          [
            'HTML behind a PNG signature',
            'image/png',
            Buffer.concat([PNG.subarray(0, 8), html]),
            /not a complete image/,
          ],
          [
            'a GIF, which the field does not take',
            'image/png',
            IMAGES['image/gif'],
            /not a complete image/,
          ],
          [
            'a JPEG, which the field takes, as a PNG',
            'image/png',
            jpeg,
            /not a complete image/,
          ],
          [
            'a PNG without its last byte',
            'image/png',
            PNG.subarray(0, -1),
            /not a complete image/,
          ],
          ['half a JPEG', 'image/jpeg', half(jpeg), /not a complete image/],
          ['half a WebP', 'image/webp', half(webp), /not a complete image/],
          ['an empty file', 'image/png', Buffer.alloc(0), /not a complete/],
          [
            'a real PNG one byte over the limit',
            'image/png',
            pngOf(2001),
            /larger than this field takes/,
          ],
          [
            '900 kB declared as a few bytes',
            'image/png',
            pngOf(900_000),
            /larger than this field takes/,
          ],
        ]
        for (const [what, contentType, body, message] of cases) {
          const key = await uploadedAs(contentType, body)
          for (const answer of await save(key)) {
            assert.equal(answer.status, 422, `${what}: ${answer.text}`)
            assert.match(answer.text, message, what)
          }
        }
        assert.deepEqual(await get('o-2'), before)
        assert.equal(
          (await ok('listCrudOffering', { limit: 100 })).rows.length,
          count
        )
      })

      test('the real image of each type the field takes is saved', async () => {
        for (const [contentType, body] of [
          ['image/png', PNG],
          ['image/png', pngOf(2000)],
          ['image/jpeg', IMAGES['image/jpeg']],
          ['image/webp', IMAGES['image/webp']],
        ] as const) {
          const key = await uploadedAs(contentType, body)
          for (const answer of await save(key)) {
            assert.equal(answer.status, 200, `${contentType}: ${answer.text}`)
            assert.equal(answer.body.row.imageKey, key)
          }
        }
      })

      test('a refused file stays in storage', async () => {
        const html = '<script>alert(1)</script>'
        const upload = await ok(UPLOAD, asked())
        await put(upload.uploadUrl, html)
        const [first] = await save(upload.fileKey)
        const [second] = await save(upload.fileKey)
        // Still "not an image", not "nothing was uploaded".
        assert.match(first.text, /not a complete image/)
        assert.match(second.text, /not a complete image/)
      })

      // A gap that is stated, not fixed: the check is of the file as it is at
      // the save, and its upload URL keeps working until it expires.
      test('the upload URL of a saved image can still replace the file', async () => {
        const upload = await ok(UPLOAD, asked())
        await put(upload.uploadUrl, PNG)
        const { row } = await ok('createCrudOffering', {
          values: values({ imageKey: upload.fileKey }),
        })
        const again = await put(upload.uploadUrl, '<script>alert(2)</script>')
        assert.equal(again.status, 200)
        const { previewUrls } = await ok('getCrudOffering', { id: row.id })
        const shown = await fetch(new URL(previewUrls.imageKey, app.url))
        assert.equal(await shown.text(), '<script>alert(2)</script>')
        // Local content serves every file as plain bytes, which a browser does
        // not render as a page.
        assert.equal(
          shown.headers.get('content-type'),
          'application/octet-stream'
        )
      })

      // Last: it widens the field to every type and builds the app again.
      test('real GIF and AVIF uploads are saved by a field that takes them', async () => {
        await app.stop()
        const crud = await app.read('db/crud.ts')
        const accept = "accept: ['image/png', 'image/jpeg', 'image/webp'],"
        assert.ok(crud.includes(accept))
        await app.write(
          'db/crud.ts',
          crud.replace(
            accept,
            "accept: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'],"
          )
        )
        await app.strictBuild()
        await app.start()
        for (const [contentType, body] of [
          ['image/gif', IMAGES['image/gif']],
          ['image/avif', IMAGES['image/avif']],
          ['image/avif', FFMPEG_AVIF],
        ] as const) {
          const key = await uploadedAs(contentType, body)
          const [created] = await save(key)
          assert.equal(created.status, 200, `${contentType}: ${created.text}`)
          const cut = await uploadedAs(contentType, body.subarray(0, -1))
          const [refused] = await save(cut)
          assert.equal(
            refused.status,
            422,
            `${contentType} cut: ${refused.text}`
          )
        }
      })
    }
  )
}
