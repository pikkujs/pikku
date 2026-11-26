/**
 * The deploy bundle of an app with a CMS, run here: the generated functions and
 * the addon's handlers have to survive bundling, and nothing that only
 * `pikku dev` grants may come with them. Nothing is deployed anywhere.
 */
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  cliIsBuilt,
  CmsTestApp,
} from '../../../../test-fixtures/cms/app-harness.js'

describe('the deploy bundle of a CMS app', { skip: !cliIsBuilt() }, () => {
  let app: CmsTestApp
  let bundle: string

  before(async () => {
    app = await CmsTestApp.create('sqlite', { addon: true })
    await app.build()
    bundle = await app.bundle()
    await app.grant({ super: ['cms'], reader: ['cms:notesNote:read'] })
    await app.startBundle(bundle)
  })
  after(async () => {
    await app?.remove()
  })

  const ok = async (name: string, data: object) => {
    const answer = await app.rpc(name, data, { user: 'super' })
    assert.equal(answer.status, 200, `${name}: ${answer.text}\n${app.log}`)
    return answer.body
  }

  test("it carries the addon's handlers", async () => {
    assert.match(await readFile(bundle, 'utf8'), /SENTINEL-BODY/)
    const { rows } = await ok('listCmsNotesNote', {})
    assert.equal(rows[0].id, 'sentinel-1')
    const { row } = await ok('runCmsNotesNoteClose', {
      id: 'sentinel-1',
      input: {},
    })
    assert.equal(row.state, 'closed')
  })

  test("the app's own collections work against its migrated database", async () => {
    const { row } = await ok('createCmsOffering', {
      values: { slug: 'bundled', title: 'Bundled' },
    })
    const listed = await ok('listCmsOffering', {
      filter: { status: { equals: 'draft' } },
      search: 'bundl',
    })
    assert.deepEqual(
      listed.rows.map((r: { id: string }) => r.id),
      [row.id]
    )
    assert.equal((await ok('describeCms', {})).collections.length, 5)
  })

  test('requests are validated and scopes hold', async () => {
    const status = async (data: object, user?: string) =>
      (await app.rpc('runCmsNotesNoteClose', data, user ? { user } : {})).status
    assert.equal(await status({ id: 'sentinel-2', input: {} }), 401)
    assert.equal(await status({ id: 'sentinel-2', input: {} }, 'reader'), 403)
    assert.equal(await status({ id: 'sentinel-2', other: 1 }, 'super'), 422)
  })

  test('the Studio token gives nothing outside pikku dev', async () => {
    // The bundle is started with the token in its environment, and given it.
    const answer = await app.rpc('listCmsNotesNote', {}, { studio: true })
    assert.equal(answer.status, 401, answer.text)
  })
})
