import { test, describe, before } from 'node:test'
import * as assert from 'assert'
import { addSchema, coerceTopLevelDataFromSchema } from './schema.js'

describe('Schema', () => {
  describe('coerceQueryStringToArray', () => {
    before(() => {
      // Add schemas dynamically using addSchema
      addSchema('testSchema', {
        properties: {
          tags: { type: 'array' },
          count: { type: 'number' },
          name: { type: 'string' },
        },
      })

      addSchema('booleanSchema', {
        properties: {
          isActive: true, // Invalid schema definition, but the function should handle it
          tags: { type: 'array' },
        },
      })
    })

    test('should split a string into an array for properties of type array', () => {
      const data = { tags: 'a,b,c' }
      coerceTopLevelDataFromSchema('testSchema', data)
      assert.deepStrictEqual(data.tags, ['a', 'b', 'c'])
    })

    test('should not modify properties of type array if they are already arrays', () => {
      const data = { tags: ['a', 'b', 'c'] }
      coerceTopLevelDataFromSchema('testSchema', data)
      assert.deepStrictEqual(data.tags, ['a', 'b', 'c'])
    })

    test('should not modify properties that are not type array', () => {
      const data = { count: 5, name: 'example' }
      coerceTopLevelDataFromSchema('testSchema', data)
      assert.strictEqual(data.count, 5)
      assert.strictEqual(data.name, 'example')
    })

    test('should handle cases where the data object does not have a key present in the schema', () => {
      const data = { unknownKey: 'shouldRemain' }
      coerceTopLevelDataFromSchema('testSchema', data)
      assert.strictEqual(data.unknownKey, 'shouldRemain')
    })

    test('should handle cases where schema properties contain boolean values', () => {
      const data = { tags: 'a,b,c', isActive: 'true' }
      coerceTopLevelDataFromSchema('booleanSchema', data)
      assert.deepStrictEqual(data.tags, ['a', 'b', 'c'])
      assert.strictEqual(data.isActive, 'true') // No coercion should happen
    })
  })
})
