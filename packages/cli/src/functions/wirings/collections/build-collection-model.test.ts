import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCollectionsModel } from './build-collection-model.js'
import {
  testDeclaration,
  testTables,
} from '../../../../test-fixtures/collections/model-fixtures.js'

type Declaration = Record<string, any>

const build = (change?: (declaration: Declaration, tables: any) => void) => {
  const declaration: Declaration = testDeclaration()
  const tables: any = testTables()
  change?.(declaration, tables)
  return buildCollectionsModel({ declaration, tables, buckets: ['site'] })
}

describe('buildCollectionsModel', () => {
  test('the declaration every refusal below starts from is accepted', () => {
    const [offering, therapist] = build().collections
    assert.equal(offering!.primaryKey, 'id')
    assert.deepEqual(
      offering!.fields.map((f) => [f.name, f.input]),
      [
        ['title', 'text'],
        ['status', 'select'],
        ['body', 'richtext'],
        ['imageKey', 'image'],
        ['priceMinor', 'money'],
        ['currency', 'text'],
        ['therapistId', 'relation'],
        ['startsAt', 'datetime'],
        ['contactEmail', 'email'],
      ]
    )
    assert.deepEqual(offering!.listColumns, [
      'id',
      'title',
      'status',
      'startsAt',
      'priceMinor',
      'imageKey',
      'currency',
    ])
    assert.ok(offering!.readColumns.includes('updatedAt'))
    assert.ok(offering!.readColumns.includes('internalCode'))
    assert.ok(!offering!.readColumns.includes('apiToken'))
    assert.deepEqual(offering!.deletesAlso, ['offeringNote'])
    assert.deepEqual(offering!.checks, {
      read: { module: 'src/checks.ts', exportName: 'mayRead' },
    })
    assert.equal(therapist!.create, false)
    assert.equal(therapist!.edit, false)
    assert.equal(therapist!.delete, false)
  })

  test('a reference column set to true is a relation, with its checks', () => {
    const { collections } = build((d) => {
      d.offering.edit.therapistId = true
    })
    const field = collections[0]!.fields.find((f) => f.name === 'therapistId')
    assert.equal(field!.input, 'relation')
    assert.equal(field!.target, 'therapist')
  })

  const refusals: [string, (d: Declaration, tables: any) => void, RegExp][] = [
    [
      'no collection',
      (d) => {
        delete d.offering
        delete d.therapist
      },
      /declares no collection/,
    ],
    [
      'a name that cannot be a scope segment',
      (d) => {
        d['a:b'] = d.therapist
      },
      /cannot name a collection/,
    ],
    [
      'a table db/tables.ts does not declare',
      (d) => {
        d.blogPost = d.therapist
      },
      /declares no table 'blogPost'/,
    ],
    [
      'an addon opt-in naming an addon that is not wired',
      (d) => {
        d.blogPost = { from: 'blog' }
      },
      /no addon wired under that name/,
    ],
    [
      'an unknown setting',
      (d) => {
        d.offering.delte = true
      },
      /unknown setting 'delte'/,
    ],
    [
      'an unknown list setting',
      (d) => {
        d.offering.list.filters = []
      },
      /unknown list setting 'filters'/,
    ],
    [
      'an unknown column',
      (d) => {
        d.offering.detail = ['titel']
      },
      /"titel", which is no column/,
    ],
    [
      'a composite primary key',
      (_d, t) => {
        delete t.offering.columns.id.primaryKey
        t.offering.primaryKey = ['id', 'title']
      },
      /single-column primary key/,
    ],
    [
      'no label',
      (d) => {
        delete d.offering.label
      },
      /'label' must be/,
    ],
    [
      'no list columns',
      (d) => {
        d.therapist.list = { columns: [] }
      },
      /at least one column/,
    ],
    [
      'a column listed twice',
      (d) => {
        d.therapist.list.columns = ['name', 'name']
      },
      /names a column twice/,
    ],
    [
      'a filter on an unlisted column',
      (d) => {
        d.offering.list.filter = ['body']
      },
      /list.filter names 'body', which is not in list.columns/,
    ],
    [
      'a sort on an unlisted column',
      (d) => {
        d.offering.list.sort = ['body']
      },
      /list.sort names 'body'/,
    ],
    [
      'a search on an unlisted column',
      (d) => {
        d.offering.list.search = ['body']
      },
      /list.search names 'body'/,
    ],
    [
      'a search on a column that is not text',
      (d) => {
        d.offering.list.search = ['priceMinor']
      },
      /not a text column/,
    ],
    [
      'a secret column in the list',
      (d) => {
        d.offering.list.columns.push('apiToken')
      },
      /'apiToken', which is secret/,
    ],
    [
      'a secret column in detail',
      (d) => {
        d.offering.detail = ['apiToken']
      },
      /'apiToken', which is secret/,
    ],
    [
      'a secret column as title',
      (d) => {
        d.offering.title = 'apiToken'
      },
      /'apiToken', which is secret/,
    ],
    [
      'a sealed column',
      (d) => {
        d.offering.detail = ['sealedNote']
      },
      /held sealed/,
    ],
    [
      'a json column',
      (d) => {
        d.offering.detail = ['meta']
      },
      /'meta', which is a json column/,
    ],
    [
      'a column of json kind',
      (d) => {
        d.offering.edit.tags = true
      },
      /'tags', which is a json column/,
    ],
    [
      'a column with no declared type',
      (d, t) => {
        t.offering.columns.loose = {}
        d.offering.detail = ['loose']
      },
      /declares no type/,
    ],
    [
      'an unknown input',
      (d) => {
        d.offering.edit.body = 'markdown'
      },
      /unknown input "markdown"/,
    ],
    [
      'an unknown field setting',
      (d) => {
        d.offering.edit.body = { input: 'richtext', rows: 4 }
      },
      /unknown edit.body setting 'rows'/,
    ],
    [
      'tags outside an addon',
      (d) => {
        d.offering.edit.body = 'tags'
      },
      /only an addon/,
    ],
    [
      'richtext on a number',
      (d) => {
        d.offering.edit.priceMinor = 'richtext'
      },
      /'richtext' needs a free text column/,
    ],
    [
      'longtext on an enum',
      (d) => {
        d.offering.edit.status = 'longtext'
      },
      /'longtext' needs a free text column/,
    ],
    [
      'an image on a number',
      (d) => {
        d.offering.edit.priceMinor = { ...d.offering.edit.imageKey }
      },
      /'image' needs a free text column/,
    ],
    [
      'an image column too short for its key',
      (d) => {
        d.offering.edit.shortCode = { ...d.offering.edit.imageKey }
      },
      /the column holds 20/,
    ],
    [
      'a bare image',
      (d) => {
        d.offering.edit.imageKey = 'image'
      },
      /'image' needs its settings/,
    ],
    [
      'an undeclared bucket',
      (d) => {
        d.offering.edit.imageKey.bucket = 'other'
      },
      /not in content.buckets/,
    ],
    [
      'an accepted type that is no image',
      (d) => {
        d.offering.edit.imageKey.accept = ['image/svg+xml']
      },
      /'accept' must list image types/,
    ],
    [
      'no size limit',
      (d) => {
        delete d.offering.edit.imageKey.maxBytes
      },
      /'maxBytes' must be/,
    ],
    [
      'money on text',
      (d) => {
        d.offering.edit.title = { input: 'money', currency: 'EUR' }
      },
      /needs an integer column/,
    ],
    [
      'money with no currency',
      (d) => {
        delete d.offering.edit.priceMinor.currency
      },
      /'currency' must be a column/,
    ],
    [
      'a currency that is neither column nor code',
      (d) => {
        d.offering.edit.priceMinor.currency = 'euro'
      },
      /'currency' must be a column/,
    ],
    [
      'a relation with no reference',
      (d) => {
        d.offering.edit.body = 'relation'
      },
      /needs a column with 'references'/,
    ],
    [
      'a relation to a table that is no collection',
      (d) => {
        delete d.therapist
      },
      /which is not a collection/,
    ],
    [
      'a relation to a column that is not the key',
      (_d, t) => {
        t.offering.columns.therapistId.references = 'therapist.name'
      },
      /must point at the primary key/,
    ],
    [
      'editing an input:false column',
      (d) => {
        d.offering.edit.internalCode = true
      },
      /`input: false`/,
    ],
    [
      'editing the primary key',
      (d) => {
        d.offering.edit.id = true
      },
      /primary key is never edited/,
    ],
    [
      'editing a submitted column',
      (d) => {
        d.offering.create = false
        d.offering.submitted = ['body']
      },
      /visitor submitted is read-only/,
    ],
    [
      'creating submitted records',
      (d) => {
        d.offering.submitted = ['internalCode']
      },
      /submission is a hand-written function/,
    ],
    [
      'create with no field',
      (d) => {
        d.therapist.create = true
      },
      /names no field to create/,
    ],
    [
      'create that cannot fill a required column',
      (d, t) => {
        t.offering.columns.slug = { type: 'text', required: true }
      },
      /nothing fills the required column 'slug'/,
    ],
    [
      'create that cannot fill an integer key',
      (d, t) => {
        t.therapist.columns.id = { type: 'integer', primaryKey: true }
        t.offering.columns.therapistId = {
          type: 'integer',
          references: 'therapist.id',
        }
        d.therapist.create = true
        d.therapist.edit = { name: true }
      },
      /nothing fills the required column 'id'/,
    ],
    [
      'create that is not a boolean',
      (d) => {
        d.offering.create = 'yes'
      },
      /'create' must be true or false/,
    ],
    [
      'delete that cascades',
      (d) => {
        d.offering.delete = true
      },
      /also delete or clear rows of offeringNote/,
    ],
    [
      'a group naming an uneditable field',
      (d) => {
        d.offering.groups[0].fields = ['internalCode']
      },
      /which is not in 'edit'/,
    ],
    [
      'a thumbnail that is no image field',
      (d) => {
        d.offering.thumbnail = 'title'
      },
      /must be an image field/,
    ],
    [
      'personal data not named in pii',
      (d) => {
        d.offering.pii = []
      },
      /'contactEmail' is personal data/,
    ],
    [
      'pii naming no column',
      (d) => {
        d.offering.pii = ['contactEmail', 'phone']
      },
      /pii names "phone"/,
    ],
    [
      'a check that is not module#export',
      (d) => {
        d.offering.permissions.read = 'mayRead'
      },
      /'<module>#<export>'/,
    ],
    [
      'a check outside the project',
      (d) => {
        d.offering.permissions.read = '../other.ts#mayRead'
      },
      /'<module>#<export>'/,
    ],
    [
      'a check with an absolute path',
      (d) => {
        d.offering.permissions.read = '/etc/checks.ts#mayRead'
      },
      /'<module>#<export>'/,
    ],
    [
      'a check on a disabled operation',
      (d) => {
        d.offering.permissions.delete = 'src/checks.ts#mayRead'
      },
      /an operation the collection does not have/,
    ],
    [
      'an unknown permissions key',
      (d) => {
        d.offering.permissions.publish = 'src/checks.ts#mayRead'
      },
      /unknown permissions key 'publish'/,
    ],
  ]

  for (const [what, change, message] of refusals) {
    test(`refuses ${what}`, () => {
      assert.throws(() => build(change), message)
    })
  }

  test('refuses a delete that would clear a reference', () => {
    assert.throws(
      () =>
        build((d, t) => {
          t.offering.columns.therapistId.onDelete = 'setNull'
          d.therapist.delete = true
        }),
      /therapist: delete is on, but .* offering through 'cascade' or 'setNull'/
    )
  })

  test('allows a delete the database would refuse on its own', () => {
    const { collections } = build((d) => {
      d.therapist.delete = true
    })
    assert.equal(collections[1]!.delete, true)
  })

  test('refuses two collections whose functions share a name', () => {
    assert.throws(
      () =>
        build((d, t) => {
          t.a = {
            columns: { id: t.therapist.columns.id, b: { type: 'text' } },
          }
          t.aBUpload = t.therapist
          d.a = {
            label: 'A',
            title: 'id',
            list: { columns: ['id'] },
            edit: { b: { ...d.offering.edit.imageKey } },
          }
          d.aBUpload = {
            label: 'B',
            title: 'name',
            list: { columns: ['name'] },
            edit: { name: true },
            create: true,
          }
        }),
      /a and aBUpload would both generate 'createCollectionABUpload'/
    )
  })
})
