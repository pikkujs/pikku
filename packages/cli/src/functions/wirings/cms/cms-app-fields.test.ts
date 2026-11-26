import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  cliIsBuilt,
  CmsTestApp,
  type Caller,
  type Engine,
} from '../../../../test-fixtures/cms/app-harness.js'

const OFFERINGS = 'cms:offering'
const READS = ['cms:offering:read', 'cms:therapist:read']

const GRANTS = {
  nobody: [],
  super: ['cms'],
  reader: ['cms:offering:read'],
  creator: ['cms:offering:read', 'cms:offering:create'],
  editor: ['cms:offering:read', 'cms:offering:edit'],
  blindWriter: ['cms:offering:create', 'cms:offering:edit'],
  // Every offering grant, and nothing on therapists.
  offerings: [OFFERINGS],
  linker: [OFFERINGS, 'cms:therapist:read'],
  both: READS,
  therapists: ['cms:therapist:read'],
  // Hold the scopes, and an app check says no.
  stranger: ['cms'],
  trainee: ['cms'],
}
const as = (user: keyof typeof GRANTS): Caller => ({ user })

/** A real one by one PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhWMjWwAAAABJRU5ErkJggg==',
  'base64'
)

for (const engine of ['sqlite', 'postgres'] as Engine[]) {
  describe(
    `generated CMS relations and images on ${engine}`,
    { skip: !cliIsBuilt() },
    () => {
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
      const status = async (name: string, data: object, caller: Caller) =>
        (await app.rpc(name, data, caller)).status

      let slugs = 0
      const values = (extra: object = {}) => ({
        slug: `file-${++slugs}`,
        title: 'With a file',
        ...extra,
      })
      const get = async (id: string) => (await ok('getCmsOffering', { id })).row

      const UPLOAD = 'createCmsOfferingImageKeyUpload'
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
      const madeUpKey = () => `cms/offering/imageKey/${randomUUID()}.png`

      test('choosing a related record needs the read of both collections', async () => {
        const name = 'searchCmsOfferingTherapistIdOptions'
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
        const name = 'searchCmsOfferingTherapistIdOptions'
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
          status('updateCmsOffering', { id, patch: { therapistId } }, as(user))
        for (const user of ['offerings', 'stranger'] as const) {
          // The same answer whether or not the record is there.
          assert.equal(await link('o-3', 't-ada', user), 403, user)
          assert.equal(await link('o-3', 'no-such', user), 403, user)
          assert.equal(
            await status(
              'createCmsOffering',
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
            'updateCmsOffering',
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
            'createCmsOffering',
            { values: values({ therapistId: 'no-such' }) },
            as('linker')
          ),
          422
        )
      })

      test('describeCms offers what a caller can use', async () => {
        const offering = async (user: keyof typeof GRANTS) => {
          const { collections } = await ok('describeCms', {}, as(user))
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
          'searchCmsOfferingTherapistIdOptions',
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
            'createCmsOffering',
            { values: values() },
            as('trainee')
          ),
          403
        )
      })

      test('a revoked grant gets no upload URL, whatever a session cache holds', async () => {
        const cached = { user: 'nobody', cached: ['cms'] }
        // The cache really is replayed: a read scope is taken from the session.
        await ok('listCmsOffering', {}, cached)
        for (const operation of ['create', 'edit']) {
          assert.equal(
            await status(UPLOAD, asked({ for: operation }), cached),
            403
          )
        }
        // Revoked write, read kept.
        const readerNow = { user: 'reader', cached: ['cms:offering'] }
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
          /^cms\/offering\/imageKey\/[0-9a-f-]{36}\.png$/
        )
        assert.equal(upload.uploadMethod, 'PUT')
      })

      test('a file goes straight to the app, is saved by its key and shown by a signed link', async () => {
        const key = await uploaded()
        const { row } = await ok('createCmsOffering', {
          values: values({ imageKey: key }),
        })
        assert.equal(row.imageKey, key)
        const { previewUrls } = await ok('getCmsOffering', { id: row.id })
        const shown = await fetch(new URL(previewUrls.imageKey, app.url))
        assert.equal(shown.status, 200)
        assert.deepEqual(Buffer.from(await shown.arrayBuffer()), PNG)
        const unsigned = new URL(previewUrls.imageKey, app.url)
        unsigned.search = ''
        assert.equal((await fetch(unsigned)).status, 403)

        const list = await ok('listCmsOffering', {
          filter: { title: { equals: 'With a file' } },
        })
        assert.equal(list.rows[0].imageKey, key)

        const cleared = await ok('updateCmsOffering', {
          id: row.id,
          patch: { imageKey: null },
        })
        assert.equal(cleared.row.imageKey, null)
        assert.deepEqual(
          (await ok('getCmsOffering', { id: row.id })).previewUrls,
          { imageKey: null }
        )
      })

      test('a record takes only the key of a file that was uploaded for the field', async () => {
        const record = await get('o-1')
        const count = (await ok('listCmsOffering', { limit: 100 })).rows.length
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
          ['a path out of the prefix', `cms/offering/imageKey/../../x.png`],
          ['an address', 'https://example.com/a.png'],
          ['a type the field does not take', real.replace('.png', '.gif')],
        ]
        for (const [what, imageKey] of refused) {
          assert.equal(
            await status(
              'updateCmsOffering',
              { id: 'o-1', patch: { imageKey } },
              as('super')
            ),
            422,
            what
          )
          assert.equal(
            await status(
              'createCmsOffering',
              { values: values({ imageKey }) },
              as('super')
            ),
            422,
            what
          )
        }
        assert.deepEqual(await get('o-1'), record)
        assert.equal(
          (await ok('listCmsOffering', { limit: 100 })).rows.length,
          count
        )
        await ok('updateCmsOffering', { id: 'o-1', patch: { imageKey: real } })
      })

      test('a value the CMS did not write gets no signed link', async () => {
        const { row, previewUrls } = await ok('getCmsOffering', { id: 'o-4' })
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

      // `getUploadURL` carries neither the type nor the size to the upload
      // route, so a field's own limits hold only for what the caller declares.
      // The route's limit is `content.sizeLimit`.
      test('the upload route does not hold a file to what was declared', async () => {
        const html = '<script>alert(1)</script>'.padEnd(5000, ' ')
        const key = await uploaded(html)
        await ok('updateCmsOffering', { id: 'o-2', patch: { imageKey: key } })
      })
    }
  )
}
