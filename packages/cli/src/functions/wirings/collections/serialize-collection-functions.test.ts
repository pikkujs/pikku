import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildCollectionsModel } from './build-collection-model.js'
import { valueKind } from './collection-columns.js'
import { describeCollectionsModel } from './collection-description.js'
import { collectionFunctionNames } from './collection-names.js'
import { serializeCollectionFunctions } from './serialize-collection-functions.js'
import { serializeCollectionSchemas } from './serialize-collection-schemas.js'
import {
  testDeclaration,
  testTables,
} from '../../../../test-fixtures/collections/model-fixtures.js'
import { collectionTempDir } from '../../../../test-fixtures/collections/temp-dir.js'

const model = (declaration: Record<string, unknown> = testDeclaration()) =>
  buildCollectionsModel({
    declaration,
    tables: testTables(),
    buckets: ['site'],
  })

const functions = (built = model()) =>
  serializeCollectionFunctions(
    built,
    {
      functionLeaf: '#pikku/function',
      authLeaf: '#pikku/auth',
      errorLeaf: '#pikku/error',
      schemas: './collections.schemas.gen.js',
      runtime: './collection-runtime.gen.js',
      checkModule: (module) => `../../../${module.replace(/ts$/, 'js')}`,
    },
    []
  )

const exportsOf = (source: string) =>
  [...source.matchAll(/^export const (\w+) = pikkuFunc/gm)].map((m) => m[1])

const sourceOf = (source: string, name: string) => {
  const start = source.indexOf(`export const ${name} = pikkuFunc`)
  assert.notEqual(start, -1, name)
  return source.slice(start, source.indexOf('\n})\n', start))
}

const constant = (source: string, name: string): string[] =>
  JSON.parse(
    source.match(new RegExp(`const ${name} = (\\[.*\\]) as const`))![1]!
  )

const dirs: string[] = []
after(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true })
})

const schemas = async (built = model()) => {
  const dir = await collectionTempDir('collection-schemas-')
  dirs.push(dir)
  const file = join(dir, 'collections.schemas.ts')
  await writeFile(file, serializeCollectionSchemas(built))
  return import(pathToFileURL(file).href)
}

describe('the generated collection functions', () => {
  test('are describeCollections and one for each operation a collection has', () => {
    assert.deepEqual(exportsOf(functions()), [
      'listCollectionOffering',
      'getCollectionOffering',
      'createCollectionOffering',
      'updateCollectionOffering',
      'createCollectionOfferingImageKeyUpload',
      'searchCollectionOfferingTherapistIdOptions',
      'listCollectionTherapist',
      'getCollectionTherapist',
      'describeCollections',
    ])
  })

  test('are the names checked for collisions, and no others', () => {
    const built = model()
    assert.deepEqual(
      exportsOf(functions(built)).sort(),
      [
        ...built.collections.flatMap(collectionFunctionNames),
        'describeCollections',
      ].sort()
    )
  })

  test('a collection that is only read gets no upload or options function', () => {
    const declaration: any = testDeclaration()
    delete declaration.offering.edit
    delete declaration.offering.create
    delete declaration.offering.groups
    delete declaration.offering.thumbnail
    delete declaration.offering.pii
    assert.deepEqual(exportsOf(functions(model(declaration))), [
      'listCollectionOffering',
      'getCollectionOffering',
      'listCollectionTherapist',
      'getCollectionTherapist',
      'describeCollections',
    ])
  })

  test('an upload asks the stored grants for what it is for', () => {
    const source = functions()
    assert.match(
      source,
      /const mayCreateCollectionOfferingImageKeyUpload = pikkuPermission\(\s+async \(\{ scopeService \}, data: \{ for: 'create' \| 'edit' \}, \{ session \}\) =>\s+collectionHolds\(\s*\['collections:offering:read', `collections:offering:\$\{data\.for\}`\]/
    )
    assert.match(
      sourceOf(source, 'createCollectionOfferingImageKeyUpload'),
      /permissions: \{ collections: \[mayCreateCollectionOfferingImageKeyUpload, appCheck0\] \},/
    )
  })

  test('options ask for the read of both collections, and for ids and titles', () => {
    const options = sourceOf(
      functions(),
      'searchCollectionOfferingTherapistIdOptions'
    )
    assert.match(
      options,
      /scopes: \['collections:offering:read', 'collections:therapist:read'\],/
    )
    assert.match(
      options,
      /\.select\('id'\)\s+\.select\(collectionText\('name'\)\)/
    )
  })

  test('a link is checked, then looked up, before anything is written', () => {
    const update = sourceOf(functions(), 'updateCollectionOffering')
    const may = update.indexOf("collectionMayLink('collections:therapist:read'")
    const found = update.indexOf('collectionLinked(')
    const write = update.indexOf('.updateTable(')
    assert.ok(may > 0 && may < found && found < write)
    assert.ok(update.indexOf('collectionUploaded(') < write)
  })

  test('a write wants read and its own grant, in the scopes and read again', () => {
    const source = functions()
    assert.match(
      source,
      /const holdsCollectionOfferingEdit = pikkuAuth\(async \(\{ scopeService \}, session\) =>\s+collectionHolds\(\s*\['collections:offering:read', 'collections:offering:edit'\],/
    )
    assert.match(
      sourceOf(source, 'updateCollectionOffering'),
      /audit: true,\n {2}scopes: \['collections:offering:read', 'collections:offering:edit'\],\n {2}permissions: \{ collections: \[holdsCollectionOfferingEdit, appCheck0\] \},/
    )
    assert.doesNotMatch(
      sourceOf(source, 'listCollectionOffering'),
      /holdsCollection/
    )
  })

  test('a timestamp is stored in one form, and an unlisted column never', () => {
    const write = sourceOf(functions(), 'createCollectionOffering')
    assert.match(
      write,
      /startsAt: collectionStoredDatetime\(values\.startsAt\),/
    )
    assert.doesNotMatch(write, /\.\.\.values|apiToken|sealedNote|meta:/)
  })

  test('each one asks for the read scope of its own collection', () => {
    const source = functions()
    assert.match(
      sourceOf(source, 'listCollectionOffering'),
      /expose: true,\n {2}readonly: true,\n {2}scopes: \['collections:offering:read'\],/
    )
    assert.match(
      sourceOf(source, 'getCollectionTherapist'),
      /scopes: \['collections:therapist:read'\],/
    )
  })

  test('select named columns, never a secret or an unlisted one', () => {
    const built = model()
    const source = functions(built)
    assert.doesNotMatch(source, /selectAll|apiToken|sealedNote/)
    for (const collection of built.collections) {
      const prefix = collection.name.replace(/([a-z])([A-Z])/g, '$1_$2')
      const times = collection.readColumns.filter(
        (column) => valueKind(collection.columns[column]!) === 'datetime'
      )
      assert.deepEqual(
        constant(source, `${prefix.toUpperCase()}_COLUMNS`),
        collection.readColumns.filter((column) => !times.includes(column))
      )
      for (const column of times) {
        assert.match(
          source,
          new RegExp(`\\.select\\(collectionText\\('${column}'\\)\\)`)
        )
      }
    }
  })

  test('put an app read check in one group, so it adds to the scope', () => {
    const declaration: any = testDeclaration()
    declaration.therapist.permissions = { read: 'src/checks.ts#isStaff' }
    const source = functions(model(declaration))
    assert.match(
      source,
      /import \{ isStaff as appCheck\d \} from '\.\.\/\.\.\/\.\.\/src\/checks\.js'/
    )
    assert.match(
      sourceOf(source, 'listCollectionTherapist'),
      /scopes: \['collections:therapist:read'\],\n {2}permissions: \{ collections: \[appCheck\d\] \},/
    )
    assert.match(
      sourceOf(source, 'describeCollections'),
      /therapist: \[holdsCollectionTherapistRead, appCheck\d\],/
    )
  })

  test('their input schemas accept the allowlists and nothing else', async () => {
    const built = model()
    const offering = built.collections.find((c) => c.name === 'offering')!
    const { ListCollectionOfferingInput, GetCollectionOfferingInput } =
      await schemas(built)
    const accepts = (value: unknown) =>
      ListCollectionOfferingInput.safeParse(value).success

    for (const column of offering.list.filter) {
      assert.ok(
        ListCollectionOfferingInput.shape.filter,
        `${column} should be filterable`
      )
    }
    for (const column of offering.list.sort) {
      assert.ok(accepts({ sort: [{ column, direction: 'asc' }] }), column)
    }
    for (const column of Object.keys(offering.columns)) {
      if (!offering.list.sort.includes(column)) {
        assert.ok(!accepts({ sort: [{ column, direction: 'asc' }] }), column)
      }
      if (!offering.list.filter.includes(column)) {
        assert.ok(!accepts({ filter: { [column]: { equals: 'x' } } }), column)
      }
    }
    assert.ok(accepts({ limit: 100, cursor: '200' }))
    assert.ok(!accepts({ limit: 101 }))
    assert.ok(!accepts({ cursor: '01' }))
    assert.ok(!accepts({ where: '1=1' }))
    assert.ok(
      !GetCollectionOfferingInput.safeParse({ id: 'a', all: true }).success
    )
  })

  test('a collection with nothing to filter, sort or search takes none', async () => {
    const declaration: any = testDeclaration()
    declaration.therapist.list = { columns: ['name'] }
    const { ListCollectionTherapistInput } = await schemas(model(declaration))
    assert.deepEqual(Object.keys(ListCollectionTherapistInput.shape), [
      'cursor',
      'limit',
    ])
  })

  test('the description is accepted by its own output schema', async () => {
    const { DescribeCollectionOutput } = await schemas()
    const collections = JSON.parse(
      JSON.stringify(describeCollectionsModel(model()))
    )
    assert.deepEqual(DescribeCollectionOutput.parse({ collections }), {
      collections,
    })
  })
})
