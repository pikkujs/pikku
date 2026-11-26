import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cmsTempDir } from '../../../../test-fixtures/cms/temp-dir.js'
import { cms } from '../../../../test-fixtures/cms-addon/db/cms.js'
import { tables } from '../../../../test-fixtures/cms-addon/db/tables.js'
import {
  testDeclaration,
  testTables,
} from '../../../../test-fixtures/cms/model-fixtures.js'
import { buildCmsModel } from './build-cms-model.js'
import { ADDON_CMS_ARTIFACT, writeAddonCms } from './cms-addon.js'
import { cmsScopeTree } from './serialize-cms-scopes.js'

type Data = Record<string, any>

const published = (): Data => structuredClone(cms) as Data

const ownBuild = (change?: (declaration: Data) => void) => {
  const declaration = published()
  change?.(declaration)
  return buildCmsModel({
    declaration,
    tables: tables as any,
    buckets: ['site'],
    addon: true,
  })
}

const host = (entries: Data, collections = published()) =>
  buildCmsModel({
    declaration: entries,
    tables: {},
    buckets: ['site'],
    addons: [
      {
        name: 'notes',
        package: '@cms-fixture/notes',
        tables: tables as any,
        collections,
      },
    ],
  })

const note = (extra: Data = {}) =>
  host({ notesNote: { from: 'notes', ...extra } }).collections[0]!

describe("an addon's own declaration", () => {
  test('may name actions, tags and a delete that cascades', () => {
    const [first] = ownBuild().collections
    assert.deepEqual(
      first!.actions.map((action) => action.name),
      ['close', 'reopen']
    )
    assert.equal(first!.tags!.maxItems, 3)
    assert.deepEqual(first!.deletesAlso, ['notesReply'])
    // What an action takes is read with the record, and no secret is.
    assert.ok(first!.readColumns.includes('remindAt'))
    assert.ok(!first!.readColumns.includes('internalToken'))
  })

  const refusals: [string, (d: Data) => void, RegExp][] = [
    [
      'a check, which only an app has',
      (d) => (d.notesNote.permissions = { read: 'src/a.ts#b' }),
      /unknown setting 'permissions'/,
    ],
    [
      'a relation, which would be searched with a query',
      (d) => (d.notesReply.edit = { noteId: true }),
      /no relation or image field/,
    ],
    [
      'an image',
      (d) =>
        (d.notesNote.edit.body = {
          input: 'image',
          bucket: 'site',
          accept: ['image/png'],
          maxBytes: 10,
        }),
      /no relation or image field/,
    ],
    [
      'an action named like an operation',
      (d) => (d.notesNote.actions.edit = { label: 'x' }),
      /actions\.edit: name an action/,
    ],
    [
      'an action name that is no scope segment',
      (d) => (d.notesNote.actions['a:b'] = { label: 'x' }),
      /actions\.a:b: name an action/,
    ],
    [
      'an action without a label',
      (d) => (d.notesNote.actions.close = {}),
      /needs a 'label'/,
    ],
    [
      'an action taking a secret',
      (d) => (d.notesNote.actions.close.input = ['internalToken']),
      /which is secret/,
    ],
    [
      'tags under another name',
      (d) => (d.notesNote.edit.title = 'tags'),
      /'tags' is a field of its own/,
    ],
  ]
  for (const [what, change, message] of refusals) {
    test(`refuses ${what}`, () => {
      assert.throws(() => ownBuild(change), message)
    })
  }
})

describe("an app's opt-in", () => {
  test('takes the collection as the addon declares it', () => {
    const collection = note()
    assert.deepEqual(collection.from, {
      name: 'notes',
      package: '@cms-fixture/notes',
    })
    assert.deepEqual(
      [collection.create, collection.edit, collection.delete],
      [true, true, true]
    )
  })

  test('switches operations and actions off, scope leaves included', () => {
    const model = host({
      notesNote: {
        from: 'notes',
        create: false,
        edit: false,
        delete: false,
        actions: { close: false },
      },
    })
    const [collection] = model.collections
    assert.deepEqual(collection!.fields, [])
    assert.deepEqual(
      collection!.actions.map((a) => a.name),
      ['reopen']
    )
    assert.deepEqual(
      Object.keys((cmsScopeTree(model).scopes as any).notesNote.scopes),
      ['read', 'reopen']
    )
  })

  const refusals: [string, Data, RegExp][] = [
    ['a field', { edit: { state: true } }, /'edit' .* can only be false/],
    ['an operation set to true', { delete: true }, /'delete' .* only be false/],
    ['a list of its own', { list: { columns: ['title'] } }, /'list' cannot be/],
    ['a title of its own', { title: 'state' }, /'title' cannot be set/],
    [
      'an action of its own',
      { actions: { archive: false } },
      /has no action of that name/,
    ],
    [
      'an action set to true',
      { actions: { close: true } },
      /actions\.close can only be false/,
    ],
    [
      'a check on what it switched off',
      { actions: { close: false }, permissions: { close: 'src/a.ts#b' } },
      /checks nothing the collection does here/,
    ],
  ]
  for (const [what, entry, message] of refusals) {
    test(`cannot add ${what}`, () => {
      assert.throws(() => note(entry), message)
    })
  }

  test('cannot name an operation the addon does not have', () => {
    for (const operation of ['create', 'edit']) {
      for (const value of [true, false]) {
        assert.throws(
          () => host({ notesReply: { from: 'notes', [operation]: value } }),
          new RegExp(`'${operation}'`),
          `${operation}: ${value}`
        )
      }
    }
  })

  test('cannot ask for a collection the addon does not publish', () => {
    assert.throws(
      () => host({ other: { from: 'notes' } }),
      /publishes no collection 'other'/
    )
  })

  test("cannot put a collection of its own over the addon's table", () => {
    assert.throws(
      () =>
        host({
          notesNote: {
            label: 'Mine',
            title: 'title',
            list: { columns: ['title'] },
          },
        }),
      /belongs to the 'notes' addon/
    )
  })

  test('is checked against the tables the addon publishes', () => {
    const collections = published()
    collections.notesNote.list.columns.push('internalToken')
    assert.throws(
      () => host({ notesNote: { from: 'notes' } }, collections),
      /the 'notes' addon: notesNote: list\.columns names 'internalToken', which is secret/
    )
  })

  test("cannot be the target of a relation of the app's own", () => {
    const declaration: Data = testDeclaration()
    const appTables: any = testTables()
    appTables.offering.columns.therapistId = {
      type: 'key',
      references: 'notesNote.id',
    }
    declaration.notesNote = { from: 'notes' }
    delete declaration.therapist
    assert.throws(
      () =>
        buildCmsModel({
          declaration,
          tables: appTables,
          buckets: ['site'],
          addons: [
            {
              name: 'notes',
              package: '@cms-fixture/notes',
              tables: tables as any,
              collections: published(),
            },
          ],
        }),
      /which the 'notes' addon owns/
    )
  })
})

describe('publishing', () => {
  const created: string[] = []
  after(async () => {
    for (const dir of created) await rm(dir, { recursive: true, force: true })
  })
  const addonCopy = async () => {
    const dir = await cmsTempDir('addon-publish-')
    created.push(dir)
    await cp(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../test-fixtures/cms-addon'
      ),
      dir,
      { recursive: true }
    )
    await rename(join(dir, 'manifest.json'), join(dir, 'package.json'))
    return dir
  }

  test('writes the declaration as data beside the generated output', async () => {
    const dir = await addonCopy()
    assert.deepEqual(await writeAddonCms(dir, join(dir, 'out')), [
      'notesNote',
      'notesReply',
    ])
    assert.deepEqual(
      JSON.parse(await readFile(join(dir, 'out', ADDON_CMS_ARTIFACT), 'utf8')),
      JSON.parse(JSON.stringify(cms))
    )
  })

  test("refuses a package without a './cms' export", async () => {
    const dir = await addonCopy()
    const manifest = JSON.parse(
      await readFile(join(dir, 'package.json'), 'utf8')
    )
    delete manifest.exports['./cms']
    await writeFile(join(dir, 'package.json'), JSON.stringify(manifest))
    await assert.rejects(
      writeAddonCms(dir, join(dir, 'out')),
      /exports no '\.\/cms'/
    )
    assert.ok(!existsSync(join(dir, 'out', ADDON_CMS_ARTIFACT)))
  })
})
