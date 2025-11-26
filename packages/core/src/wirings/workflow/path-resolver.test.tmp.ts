import { test, describe } from 'node:test'
import * as assert from 'assert'
import {
  parsePath,
  traversePath,
  resolvePath,
  resolveInputValue,
  resolveInputs,
  validatePath,
  type PathResolverContext,
} from './path-resolver.js'
import type { NodeExecutionResult } from './workflow-graph.types.js'

describe('parsePath', () => {
  test('should parse simple property path', () => {
    const segments = parsePath('node_1')
    assert.deepStrictEqual(segments, [{ type: 'property', name: 'node_1' }])
  })

  test('should parse dot notation path', () => {
    const segments = parsePath('node_1.output.field')
    assert.deepStrictEqual(segments, [
      { type: 'property', name: 'node_1' },
      { type: 'property', name: 'output' },
      { type: 'property', name: 'field' },
    ])
  })

  test('should parse array index access', () => {
    const segments = parsePath('node_1.output.users[0]')
    assert.deepStrictEqual(segments, [
      { type: 'property', name: 'node_1' },
      { type: 'property', name: 'output' },
      { type: 'property', name: 'users' },
      { type: 'index', index: 0 },
    ])
  })

  test('should parse nested array access', () => {
    const segments = parsePath('node_1.output.data[0].items[1].name')
    assert.deepStrictEqual(segments, [
      { type: 'property', name: 'node_1' },
      { type: 'property', name: 'output' },
      { type: 'property', name: 'data' },
      { type: 'index', index: 0 },
      { type: 'property', name: 'items' },
      { type: 'index', index: 1 },
      { type: 'property', name: 'name' },
    ])
  })

  test('should throw on missing closing bracket', () => {
    assert.throws(() => parsePath('node_1.output[0'), /missing closing bracket/)
  })

  test('should throw on non-numeric index', () => {
    assert.throws(
      () => parsePath('node_1.output[abc]'),
      /non-numeric array index/
    )
  })
})

describe('traversePath', () => {
  const testObj = {
    output: {
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
      count: 2,
    },
  }

  test('should traverse simple property', () => {
    const result = traversePath(testObj, [{ type: 'property', name: 'output' }])
    assert.deepStrictEqual(result, testObj.output)
  })

  test('should traverse nested properties', () => {
    const result = traversePath(testObj, [
      { type: 'property', name: 'output' },
      { type: 'property', name: 'count' },
    ])
    assert.strictEqual(result, 2)
  })

  test('should traverse array index', () => {
    const result = traversePath(testObj, [
      { type: 'property', name: 'output' },
      { type: 'property', name: 'users' },
      { type: 'index', index: 0 },
      { type: 'property', name: 'name' },
    ])
    assert.strictEqual(result, 'Alice')
  })

  test('should return undefined for non-existent path', () => {
    const result = traversePath(testObj, [
      { type: 'property', name: 'output' },
      { type: 'property', name: 'nonexistent' },
    ])
    assert.strictEqual(result, undefined)
  })

  test('should return undefined when traversing null', () => {
    const result = traversePath(null, [{ type: 'property', name: 'foo' }])
    assert.strictEqual(result, undefined)
  })
})

describe('resolvePath', () => {
  const testObj = {
    node_1: {
      output: {
        orgId: 'org-123',
      },
    },
  }

  test('should resolve full path', () => {
    const result = resolvePath('node_1.output.orgId', testObj)
    assert.strictEqual(result, 'org-123')
  })
})

describe('resolveInputValue', () => {
  const context: PathResolverContext = {
    completed: new Map<string, NodeExecutionResult>([
      [
        'createOrg_1',
        {
          instanceId: 'createOrg_1',
          iteration: 0,
          output: { orgId: 'org-123', name: 'Test Org' },
        },
      ],
      [
        'getUsers_1',
        {
          instanceId: 'getUsers_1',
          iteration: 0,
          output: { users: [{ id: 1 }, { id: 2 }] },
        },
      ],
    ]),
    triggerInput: { initialData: 'test' },
  }

  test('should return literal value directly', () => {
    const result = resolveInputValue(
      { type: 'literal', value: 'hello' },
      context
    )
    assert.strictEqual(result, 'hello')
  })

  test('should resolve ref to output field', () => {
    const result = resolveInputValue(
      { type: 'ref', path: 'createOrg_1.output.orgId' },
      context
    )
    assert.strictEqual(result, 'org-123')
  })

  test('should resolve ref to full output', () => {
    const result = resolveInputValue(
      { type: 'ref', path: 'createOrg_1.output' },
      context
    )
    assert.deepStrictEqual(result, { orgId: 'org-123', name: 'Test Org' })
  })

  test('should resolve ref with array access', () => {
    const result = resolveInputValue(
      { type: 'ref', path: 'getUsers_1.output.users[0].id' },
      context
    )
    assert.strictEqual(result, 1)
  })

  test('should throw for non-existent instance', () => {
    assert.throws(
      () =>
        resolveInputValue(
          { type: 'ref', path: 'nonexistent.output.field' },
          context
        ),
      /instance 'nonexistent' not found/
    )
  })
})

describe('resolveInputs', () => {
  const context: PathResolverContext = {
    completed: new Map<string, NodeExecutionResult>([
      [
        'node_1',
        {
          instanceId: 'node_1',
          iteration: 0,
          output: { value: 42 },
        },
      ],
    ]),
    triggerInput: {},
  }

  test('should resolve multiple inputs', () => {
    const result = resolveInputs(
      {
        literalValue: { type: 'literal', value: 'hello' },
        refValue: { type: 'ref', path: 'node_1.output.value' },
      },
      context
    )
    assert.deepStrictEqual(result, {
      literalValue: 'hello',
      refValue: 42,
    })
  })
})

describe('validatePath', () => {
  test('should validate correct path', () => {
    const result = validatePath('node_1.output.field')
    assert.strictEqual(result.valid, true)
  })

  test('should validate path to error', () => {
    const result = validatePath('node_1.error.message')
    assert.strictEqual(result.valid, true)
  })

  test('should reject empty path', () => {
    const result = validatePath('')
    assert.strictEqual(result.valid, false)
    assert.match(result.error!, /Empty/)
  })

  test('should reject invalid accessor', () => {
    const result = validatePath('node_1.invalid.field')
    assert.strictEqual(result.valid, false)
    assert.match(result.error!, /'output' or 'error'/)
  })
})
