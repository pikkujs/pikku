import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildCmsModel } from './build-cms-model.js'
import { valueKind } from './cms-columns.js'
import { describeCmsModel } from './cms-description.js'
import { cmsFunctionNames } from './cms-names.js'
import { serializeCmsFunctions } from './serialize-cms-functions.js'
import { serializeCmsSchemas } from './serialize-cms-schemas.js'
import {
  testDeclaration,
  testTables,
} from '../../../../test-fixtures/cms/model-fixtures.js'
import { cmsTempDir } from '../../../../test-fixtures/cms/temp-dir.js'

const model = (declaration: Record<string, unknown> = testDeclaration()) =>
  buildCmsModel({ declaration, tables: testTables(), buckets: ['site'] })

const functions = (built = model()) =>
  serializeCmsFunctions(
    built,
    {
      functionLeaf: '#pikku/function',
      authLeaf: '#pikku/auth',
      errorLeaf: '#pikku/error',
      schemas: './cms.schemas.gen.js',
      runtime: './cms-runtime.gen.js',
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
  const dir = await cmsTempDir('cms-schemas-')
  dirs.push(dir)
  const file = join(dir, 'cms.schemas.ts')
  await writeFile(file, serializeCmsSchemas(built))
  return import(pathToFileURL(file).href)
}

describe('the generated CMS functions', () => {
  test('are describeCms and one for each operation a collection has', () => {
    assert.deepEqual(exportsOf(functions()), [
      'listCmsOffering',
      'getCmsOffering',
      'createCmsOffering',
      'updateCmsOffering',
      'createCmsOfferingImageKeyUpload',
      'searchCmsOfferingTherapistIdOptions',
      'listCmsTherapist',
      'getCmsTherapist',
      'describeCms',
    ])
  })

  test('are the names checked for collisions, and no others', () => {
    const built = model()
    assert.deepEqual(
      exportsOf(functions(built)).sort(),
      [...built.collections.flatMap(cmsFunctionNames), 'describeCms'].sort()
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
      'listCmsOffering',
      'getCmsOffering',
      'listCmsTherapist',
      'getCmsTherapist',
      'describeCms',
    ])
  })

  test('an upload asks the stored grants for what it is for', () => {
    const source = functions()
    assert.match(
      source,
      /const mayCreateCmsOfferingImageKeyUpload = pikkuPermission\(\s+async \(\{ scopeService \}, data: \{ for: 'create' \| 'edit' \}, \{ session \}\) =>\s+cmsHolds\(\s*\['cms:offering:read', `cms:offering:\$\{data\.for\}`\]/
    )
    assert.match(
      sourceOf(source, 'createCmsOfferingImageKeyUpload'),
      /permissions: \{ cms: \[mayCreateCmsOfferingImageKeyUpload, appCheck0\] \},/
    )
  })

  test('options ask for the read of both collections, and for ids and titles', () => {
    const options = sourceOf(functions(), 'searchCmsOfferingTherapistIdOptions')
    assert.match(
      options,
      /scopes: \['cms:offering:read', 'cms:therapist:read'\],/
    )
    assert.match(options, /\.select\('id'\)\s+\.select\(cmsText\('name'\)\)/)
  })

  test('a link is checked, then looked up, before anything is written', () => {
    const update = sourceOf(functions(), 'updateCmsOffering')
    const may = update.indexOf("cmsMayLink('cms:therapist:read'")
    const found = update.indexOf('cmsLinked(')
    const write = update.indexOf('.updateTable(')
    assert.ok(may > 0 && may < found && found < write)
    assert.ok(update.indexOf('cmsUploaded(') < write)
  })

  test('a write wants read and its own grant, in the scopes and read again', () => {
    const source = functions()
    assert.match(
      source,
      /const holdsCmsOfferingEdit = pikkuAuth\(async \(\{ scopeService \}, session\) =>\s+cmsHolds\(\s*\['cms:offering:read', 'cms:offering:edit'\],/
    )
    assert.match(
      sourceOf(source, 'updateCmsOffering'),
      /audit: true,\n {2}scopes: \['cms:offering:read', 'cms:offering:edit'\],\n {2}permissions: \{ cms: \[holdsCmsOfferingEdit, appCheck0\] \},/
    )
    assert.doesNotMatch(sourceOf(source, 'listCmsOffering'), /holdsCms/)
  })

  test('a timestamp is stored in one form, and an unlisted column never', () => {
    const write = sourceOf(functions(), 'createCmsOffering')
    assert.match(write, /startsAt: cmsStoredDatetime\(values\.startsAt\),/)
    assert.doesNotMatch(write, /\.\.\.values|apiToken|sealedNote|meta:/)
  })

  test('each one asks for the read scope of its own collection', () => {
    const source = functions()
    assert.match(
      sourceOf(source, 'listCmsOffering'),
      /expose: true,\n {2}readonly: true,\n {2}scopes: \['cms:offering:read'\],/
    )
    assert.match(
      sourceOf(source, 'getCmsTherapist'),
      /scopes: \['cms:therapist:read'\],/
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
          new RegExp(`\\.select\\(cmsText\\('${column}'\\)\\)`)
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
      sourceOf(source, 'listCmsTherapist'),
      /scopes: \['cms:therapist:read'\],\n {2}permissions: \{ cms: \[appCheck\d\] \},/
    )
    assert.match(
      sourceOf(source, 'describeCms'),
      /therapist: \[holdsCmsTherapistRead, appCheck\d\],/
    )
  })

  test('their input schemas accept the allowlists and nothing else', async () => {
    const built = model()
    const offering = built.collections.find((c) => c.name === 'offering')!
    const { ListCmsOfferingInput, GetCmsOfferingInput } = await schemas(built)
    const accepts = (value: unknown) =>
      ListCmsOfferingInput.safeParse(value).success

    for (const column of offering.list.filter) {
      assert.ok(
        ListCmsOfferingInput.shape.filter,
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
    assert.ok(!GetCmsOfferingInput.safeParse({ id: 'a', all: true }).success)
  })

  test('a collection with nothing to filter, sort or search takes none', async () => {
    const declaration: any = testDeclaration()
    declaration.therapist.list = { columns: ['name'] }
    const { ListCmsTherapistInput } = await schemas(model(declaration))
    assert.deepEqual(Object.keys(ListCmsTherapistInput.shape), [
      'cursor',
      'limit',
    ])
  })

  test('the description is accepted by its own output schema', async () => {
    const { DescribeCmsOutput } = await schemas()
    const collections = JSON.parse(JSON.stringify(describeCmsModel(model())))
    assert.deepEqual(DescribeCmsOutput.parse({ collections }), { collections })
  })
})
