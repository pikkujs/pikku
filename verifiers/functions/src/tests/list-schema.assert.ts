import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'

const schemasDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.pikku',
  'schemas',
  'schemas'
)

type Schema = {
  $ref?: string
  definitions: Record<string, any>
  [key: string]: any
}

const load = (name: string): Schema =>
  JSON.parse(readFileSync(join(schemasDir, `${name}.schema.json`), 'utf-8'))

const root = (schema: Schema) =>
  schema.$ref
    ? schema.definitions[schema.$ref.replace('#/definitions/', '')]
    : schema

const holes = (node: unknown, path: string[] = []): string[] => {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => holes(child, [...path, String(i)]))
  }
  if (!node || typeof node !== 'object') return []
  const entries = Object.entries(node)
  const found: string[] = []
  const parent = path[path.length - 1]
  if (
    entries.length === 0 &&
    parent !== 'properties' &&
    parent !== 'definitions'
  ) {
    found.push(path.join('/'))
  }
  for (const [key, child] of entries) {
    found.push(...holes(child, [...path, key]))
  }
  return found
}

describe('list function schema verifier', () => {
  const input = load('ListItemsInput')
  const properties = root(input).properties

  test('the filter fields nest under filter and are not merged flat', () => {
    assert.deepEqual(Object.keys(properties).sort(), [
      'cursor',
      'filter',
      'limit',
      'search',
      'sort',
    ])
  })

  test('filter is the recursive Filter, not unknown', () => {
    assert.match(properties.filter.$ref, /^#\/definitions\/Filter</)
    const filter =
      input.definitions[properties.filter.$ref.replace('#/definitions/', '')]
    const mentionsItself = JSON.stringify(filter).includes(
      properties.filter.$ref
    )
    assert.ok(mentionsItself, 'Filter should recurse through $ref')
  })

  test('sort.column is an enum of the declared sort columns', () => {
    const ref: string = properties.sort.items.properties.column.$ref
    assert.deepEqual(
      input.definitions[ref.replace('#/definitions/', '')].enum,
      ['createdAt', 'label']
    )
  })

  test('no unknown or never reaches the input or output schema', () => {
    assert.deepEqual(holes(input), [])
    assert.deepEqual(holes(load('ListItemsOutput')), [])
  })

  test('the schema accepts a nested filter and rejects a flat one', () => {
    const quiet = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    } as any
    const schemas = new CFWorkerSchemaService(quiet)
    schemas.compileSchema('ListItemsInput', input)
    schemas.validateSchema('ListItemsInput', {
      filter: { category: 'books' },
      sort: [{ column: 'label', direction: 'asc' }],
    })
    assert.throws(() =>
      schemas.validateSchema('ListItemsInput', {
        category: 'books',
        sort: [{ column: 'label', direction: 'asc' }],
      })
    )
    assert.throws(() =>
      schemas.validateSchema('ListItemsInput', {
        sort: [{ column: 'id', direction: 'asc' }],
      })
    )
  })
})
