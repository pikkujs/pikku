import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildCrudModel } from './build-crud-model.js'
import { valueKind } from './crud-columns.js'
import { describeCrudModel } from './crud-description.js'
import { crudFunctionNames } from './crud-names.js'
import { serializeCrudFunctions } from './serialize-crud-functions.js'
import { serializeCrudSchemas } from './serialize-crud-schemas.js'
import {
  testDeclaration,
  testTables,
} from '../../../../test-fixtures/crud/model-fixtures.js'
import { crudTempDir } from '../../../../test-fixtures/crud/temp-dir.js'

const model = (declaration: Record<string, unknown> = testDeclaration()) =>
  buildCrudModel({ declaration, tables: testTables(), buckets: ['site'] })

const functions = (built = model()) =>
  serializeCrudFunctions(
    built,
    {
      functionLeaf: '#pikku/function',
      authLeaf: '#pikku/auth',
      errorLeaf: '#pikku/error',
      schemas: './crud.schemas.gen.js',
      runtime: './crud-runtime.gen.js',
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
  const dir = await crudTempDir('crud-schemas-')
  dirs.push(dir)
  const file = join(dir, 'crud.schemas.ts')
  await writeFile(file, serializeCrudSchemas(built))
  return import(pathToFileURL(file).href)
}

describe('the generated CRUD functions', () => {
  test('are describeCrud and one for each operation a collection has', () => {
    assert.deepEqual(exportsOf(functions()), [
      'listCrudOffering',
      'getCrudOffering',
      'createCrudOffering',
      'updateCrudOffering',
      'createCrudOfferingImageKeyUpload',
      'searchCrudOfferingTherapistIdOptions',
      'listCrudTherapist',
      'getCrudTherapist',
      'describeCrud',
    ])
  })

  test('are the names checked for collisions, and no others', () => {
    const built = model()
    assert.deepEqual(
      exportsOf(functions(built)).sort(),
      [...built.collections.flatMap(crudFunctionNames), 'describeCrud'].sort()
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
      'listCrudOffering',
      'getCrudOffering',
      'listCrudTherapist',
      'getCrudTherapist',
      'describeCrud',
    ])
  })

  test('an upload asks the stored grants for what it is for', () => {
    const source = functions()
    assert.match(
      source,
      /const mayCreateCrudOfferingImageKeyUpload = pikkuPermission\(\s+async \(\{ scopeService \}, data: \{ for: 'create' \| 'edit' \}, \{ session \}\) =>\s+crudHolds\(\s*\['crud:offering:read', `crud:offering:\$\{data\.for\}`\]/
    )
    assert.match(
      sourceOf(source, 'createCrudOfferingImageKeyUpload'),
      /permissions: \{ crud: \[mayCreateCrudOfferingImageKeyUpload, appCheck0\] \},/
    )
  })

  test('options ask for the read of both collections, and for ids and titles', () => {
    const options = sourceOf(
      functions(),
      'searchCrudOfferingTherapistIdOptions'
    )
    assert.match(
      options,
      /scopes: \['crud:offering:read', 'crud:therapist:read'\],/
    )
    assert.match(options, /\.select\('id'\)\s+\.select\(crudText\('name'\)\)/)
  })

  test('a link is checked, then looked up, before anything is written', () => {
    const update = sourceOf(functions(), 'updateCrudOffering')
    const may = update.indexOf("crudMayLink('crud:therapist:read'")
    const found = update.indexOf('crudLinked(')
    const write = update.indexOf('.updateTable(')
    assert.ok(may > 0 && may < found && found < write)
    assert.ok(update.indexOf('crudUploaded(') < write)
  })

  test('a write wants read and its own grant, in the scopes and read again', () => {
    const source = functions()
    assert.match(
      source,
      /const holdsCrudOfferingEdit = pikkuAuth\(async \(\{ scopeService \}, session\) =>\s+crudHolds\(\s*\['crud:offering:read', 'crud:offering:edit'\],/
    )
    assert.match(
      sourceOf(source, 'updateCrudOffering'),
      /audit: true,\n {2}scopes: \['crud:offering:read', 'crud:offering:edit'\],\n {2}permissions: \{ crud: \[holdsCrudOfferingEdit, appCheck0\] \},/
    )
    assert.doesNotMatch(sourceOf(source, 'listCrudOffering'), /holdsCrud/)
  })

  test('a timestamp is stored in one form, and an unlisted column never', () => {
    const write = sourceOf(functions(), 'createCrudOffering')
    assert.match(write, /startsAt: crudStoredDatetime\(values\.startsAt\),/)
    assert.doesNotMatch(write, /\.\.\.values|apiToken|sealedNote|meta:/)
  })

  test('each one asks for the read scope of its own collection', () => {
    const source = functions()
    assert.match(
      sourceOf(source, 'listCrudOffering'),
      /expose: true,\n {2}readonly: true,\n {2}scopes: \['crud:offering:read'\],/
    )
    assert.match(
      sourceOf(source, 'getCrudTherapist'),
      /scopes: \['crud:therapist:read'\],/
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
          new RegExp(`\\.select\\(crudText\\('${column}'\\)\\)`)
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
      sourceOf(source, 'listCrudTherapist'),
      /scopes: \['crud:therapist:read'\],\n {2}permissions: \{ crud: \[appCheck\d\] \},/
    )
    assert.match(
      sourceOf(source, 'describeCrud'),
      /therapist: \[holdsCrudTherapistRead, appCheck\d\],/
    )
  })

  test('their input schemas accept the allowlists and nothing else', async () => {
    const built = model()
    const offering = built.collections.find((c) => c.name === 'offering')!
    const { ListCrudOfferingInput, GetCrudOfferingInput } = await schemas(built)
    const accepts = (value: unknown) =>
      ListCrudOfferingInput.safeParse(value).success

    for (const column of offering.list.filter) {
      assert.ok(
        ListCrudOfferingInput.shape.filter,
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
    assert.ok(!GetCrudOfferingInput.safeParse({ id: 'a', all: true }).success)
  })

  test('a collection with nothing to filter, sort or search takes none', async () => {
    const declaration: any = testDeclaration()
    declaration.therapist.list = { columns: ['name'] }
    const { ListCrudTherapistInput } = await schemas(model(declaration))
    assert.deepEqual(Object.keys(ListCrudTherapistInput.shape), [
      'cursor',
      'limit',
    ])
  })

  test('the description is accepted by its own output schema', async () => {
    const { DescribeCrudOutput } = await schemas()
    const collections = JSON.parse(JSON.stringify(describeCrudModel(model())))
    assert.deepEqual(DescribeCrudOutput.parse({ collections }), { collections })
  })
})
