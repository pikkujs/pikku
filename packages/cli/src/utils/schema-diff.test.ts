import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { diffSchema, type SchemaChange } from './schema-diff.js'

const object = (
  properties: Record<string, unknown>,
  required: string[] = [],
  extra: Record<string, unknown> = {}
) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
  ...extra,
})

const str = { type: 'string' }
const num = { type: 'number' }

const find = (changes: SchemaChange[], path: string) =>
  changes.find((c) => c.path === path)

describe('diffSchema — input (what callers send)', () => {
  test('a removed field is breaking', () => {
    const changes = diffSchema(
      object({ a: str, b: str }, ['a']),
      object({ a: str }, ['a']),
      'input'
    )
    assert.equal(find(changes, 'b')?.breaking, true)
    assert.equal(find(changes, 'b')?.reason, 'field removed')
  })

  test('a removed field is not breaking when the schema stays open', () => {
    const changes = diffSchema(
      object({ a: str, b: str }, ['a'], { additionalProperties: true }),
      object({ a: str }, ['a'], { additionalProperties: true }),
      'input'
    )
    assert.equal(find(changes, 'b')?.breaking, false)
  })

  test('a new required field is breaking', () => {
    const changes = diffSchema(
      object({ a: str }, ['a']),
      object({ a: str, b: str }, ['a', 'b']),
      'input'
    )
    assert.equal(find(changes, 'b')?.breaking, true)
    assert.equal(find(changes, 'b')?.reason, 'required field added')
  })

  test('a new optional field is not breaking', () => {
    const changes = diffSchema(
      object({ a: str }, ['a']),
      object({ a: str, b: str }, ['a']),
      'input'
    )
    assert.equal(find(changes, 'b')?.breaking, false)
  })

  test('making a field optional is not breaking', () => {
    const changes = diffSchema(
      object({ a: str, b: str }, ['a', 'b']),
      object({ a: str, b: str }, ['a']),
      'input'
    )
    assert.equal(find(changes, 'b')?.breaking, false)
  })

  test('making an optional field required is breaking', () => {
    const changes = diffSchema(
      object({ a: str, b: str }, ['a']),
      object({ a: str, b: str }, ['a', 'b']),
      'input'
    )
    assert.equal(find(changes, 'b')?.breaking, true)
  })

  test('an identical schema produces no changes', () => {
    const schema = object({ a: str, b: num }, ['a'])
    assert.deepEqual(diffSchema(schema, structuredClone(schema), 'input'), [])
  })
})

describe('diffSchema — output (what callers read)', () => {
  test('a removed field is breaking even though the schema is open', () => {
    const changes = diffSchema(
      object({ a: str, b: str }, ['a'], { additionalProperties: true }),
      object({ a: str }, ['a'], { additionalProperties: true }),
      'output'
    )
    assert.equal(find(changes, 'b')?.breaking, true)
  })

  test('a new required field is not breaking', () => {
    const changes = diffSchema(
      object({ a: str }, ['a']),
      object({ a: str, b: str }, ['a', 'b']),
      'output'
    )
    assert.equal(find(changes, 'b')?.breaking, false)
  })

  test('a field that is no longer guaranteed is breaking', () => {
    const changes = diffSchema(
      object({ a: str, b: str }, ['a', 'b']),
      object({ a: str, b: str }, ['a']),
      'output'
    )
    assert.equal(find(changes, 'b')?.breaking, true)
    assert.equal(
      find(changes, 'b')?.reason,
      'field is no longer guaranteed to be present'
    )
  })
})

describe('diffSchema — types, enums and nesting', () => {
  test('a changed type is breaking in both directions', () => {
    for (const direction of ['input', 'output'] as const) {
      const changes = diffSchema(
        object({ a: str }, ['a']),
        object({ a: num }, ['a']),
        direction
      )
      assert.equal(find(changes, 'a')?.breaking, true, direction)
    }
  })

  test('removing an enum value breaks callers but not consumers', () => {
    const before = object({ mode: { type: 'string', enum: ['a', 'b'] } }, [
      'mode',
    ])
    const after = object({ mode: { type: 'string', enum: ['a'] } }, ['mode'])
    assert.equal(
      find(diffSchema(before, after, 'input'), 'mode')?.breaking,
      true
    )
    assert.equal(
      find(diffSchema(before, after, 'output'), 'mode')?.breaking,
      false
    )
  })

  test('adding an enum value breaks consumers but not callers', () => {
    const before = object({ mode: { type: 'string', enum: ['a'] } }, ['mode'])
    const after = object({ mode: { type: 'string', enum: ['a', 'b'] } }, [
      'mode',
    ])
    assert.equal(
      find(diffSchema(before, after, 'input'), 'mode')?.breaking,
      false
    )
    assert.equal(
      find(diffSchema(before, after, 'output'), 'mode')?.breaking,
      true
    )
  })

  test('nested and array-item fields are reported by path', () => {
    const before = object(
      { user: object({ name: str, email: str }, ['name', 'email']) },
      ['user']
    )
    const after = object({ user: object({ name: str }, ['name']) }, ['user'])
    const changes = diffSchema(before, after, 'output')
    assert.equal(find(changes, 'user.email')?.breaking, true)

    const beforeList = object(
      {
        items: {
          type: 'array',
          items: object({ id: str, label: str }, ['id']),
        },
      },
      ['items']
    )
    const afterList = object(
      { items: { type: 'array', items: object({ id: str }, ['id']) } },
      ['items']
    )
    const listChanges = diffSchema(beforeList, afterList, 'output')
    assert.equal(find(listChanges, 'items[].label')?.breaking, true)
  })

  test('local $refs are resolved against the schema they were authored in', () => {
    const before = {
      type: 'object',
      properties: { user: { $ref: '#/definitions/User' } },
      required: ['user'],
      additionalProperties: false,
      definitions: { User: object({ id: str, email: str }, ['id', 'email']) },
    }
    const after = {
      type: 'object',
      properties: { user: { $ref: '#/definitions/User' } },
      required: ['user'],
      additionalProperties: false,
      definitions: { User: object({ id: str }, ['id']) },
    }
    assert.equal(
      find(diffSchema(before, after, 'output'), 'user.email')?.breaking,
      true
    )
  })

  test('a self-referencing $ref terminates instead of recursing forever', () => {
    const recursive = {
      type: 'object',
      properties: { child: { $ref: '#/definitions/Node' } },
      additionalProperties: false,
      definitions: {
        Node: {
          type: 'object',
          properties: { child: { $ref: '#/definitions/Node' } },
          additionalProperties: false,
        },
      },
    }
    assert.deepEqual(
      diffSchema(recursive, structuredClone(recursive), 'output'),
      []
    )
  })
})

describe('diffSchema — a schema appearing or disappearing', () => {
  test('gaining a required input is breaking; gaining an optional one is not', () => {
    assert.equal(
      diffSchema(undefined, object({ a: str }, ['a']), 'input')[0].breaking,
      true
    )
    assert.equal(
      diffSchema(undefined, object({ a: str }, []), 'input')[0].breaking,
      false
    )
  })

  test('losing an output is breaking; losing an input is not', () => {
    assert.equal(
      diffSchema(object({ a: str }, ['a']), undefined, 'output')[0].breaking,
      true
    )
    assert.equal(
      diffSchema(object({ a: str }, ['a']), undefined, 'input')[0].breaking,
      false
    )
  })

  test('two absent schemas are not a change', () => {
    assert.deepEqual(diffSchema(undefined, undefined, 'input'), [])
  })
})
