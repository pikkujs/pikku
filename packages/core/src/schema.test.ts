import { test, describe, before, beforeEach } from 'node:test'
import * as assert from 'assert'
import {
  addSchema,
  getSchema,
  coerceTopLevelDataFromSchema,
  validateSchema,
  compileAllSchemas,
} from './schema.js'
import { resetPikkuState } from './pikku-state.js'

describe('Schema', () => {
  describe('addSchema and getSchema', () => {
    beforeEach(() => {
      resetPikkuState()
    })

    test('should add and retrieve a schema', () => {
      const schema = { properties: { name: { type: 'string' } } }
      addSchema('testAdd', schema)
      const result = getSchema('testAdd')
      assert.deepStrictEqual(result, schema)
    })

    test('should return undefined for non-existent schema', () => {
      const result = getSchema('nonExistent')
      assert.strictEqual(result, undefined)
    })

    test('should add schema for specific package', () => {
      const schema = { properties: { id: { type: 'number' } } }
      addSchema('pkgSchema', schema, '@addon/pkg')
      const result = getSchema('pkgSchema', '@addon/pkg')
      assert.deepStrictEqual(result, schema)
    })

    test('should not find package schema in main', () => {
      addSchema('pkgOnly', { properties: {} }, '@addon/pkg')
      const result = getSchema('pkgOnly', null)
      assert.strictEqual(result, undefined)
    })

    test('should unwrap default export', () => {
      const schema = { default: { properties: { x: { type: 'string' } } } }
      addSchema('withDefault', schema)
      const result = getSchema('withDefault')
      assert.deepStrictEqual(result, { properties: { x: { type: 'string' } } })
    })
  })

  describe('coerceTopLevelDataFromSchema', () => {
    before(() => {
      addSchema('testSchema', {
        properties: {
          tags: { type: 'array' },
          count: { type: 'number' },
          name: { type: 'string' },
        },
      })

      addSchema('booleanSchema', {
        properties: {
          isActive: true,
          tags: { type: 'array' },
        },
      })

      addSchema('dateSchema', {
        properties: {
          createdAt: { type: 'string', format: 'date-time' },
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
      assert.strictEqual(data.isActive, 'true')
    })

    test('should coerce date-time strings to Date objects', () => {
      const data = { createdAt: '2024-01-01T00:00:00Z' } as any
      coerceTopLevelDataFromSchema('dateSchema', data)
      assert.ok(data.createdAt instanceof Date)
    })
  })

  describe('validateSchema', () => {
    beforeEach(() => {
      resetPikkuState()
    })

    test('should pass when no schema service provided', async () => {
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any
      await validateSchema(logger, undefined, 'some-schema', { data: 1 })
    })

    test('should warn when no schema name but data is passed', async () => {
      let warningMsg = ''
      const logger = {
        info: () => {},
        warn: (msg: string) => {
          warningMsg = msg
        },
        error: () => {},
        debug: () => {},
      } as any
      const schemaService = {
        compileSchema: async () => {},
        validateSchema: async () => {},
        getSchemaNames: () => new Set<string>(),
      }
      await assert.rejects(
        () => validateSchema(logger, schemaService, null, { key: 'value' }),
        (err: any) => err.message === 'No data expected'
      )
    })

    test('should return early when no schema name and empty data', async () => {
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any
      const schemaService = {
        compileSchema: async () => {},
        validateSchema: async () => {},
        getSchemaNames: () => new Set<string>(),
      }
      await validateSchema(logger, schemaService, null, {})
    })

    test('should throw MissingSchemaError when schema not found', async () => {
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any
      const schemaService = {
        compileSchema: async () => {},
        validateSchema: async () => {},
        getSchemaNames: () => new Set<string>(),
      }
      await assert.rejects(
        () => validateSchema(logger, schemaService, 'nonExistent', { data: 1 }),
        (err: any) => err.message.includes('not found')
      )
    })

    test('should compile and validate schema when found', async () => {
      addSchema('validSchema', { properties: { name: { type: 'string' } } })
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any
      let compiled = false
      let validated = false
      const schemaService = {
        compileSchema: async () => {
          compiled = true
        },
        validateSchema: async () => {
          validated = true
        },
        getSchemaNames: () => new Set<string>(),
      }
      await validateSchema(logger, schemaService, 'validSchema', {
        name: 'test',
      })
      assert.strictEqual(compiled, true)
      assert.strictEqual(validated, true)
    })
  })

  describe('compileAllSchemas', () => {
    beforeEach(() => {
      resetPikkuState()
    })

    test('should throw when no schema service available', () => {
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any
      assert.throws(() => compileAllSchemas(logger), {
        message: 'SchemaService needs to be defined to load schemas',
      })
    })

    test('should compile all schemas across packages', () => {
      addSchema('schema1', { properties: { a: { type: 'string' } } })
      addSchema('schema2', { properties: { b: { type: 'number' } } })

      const compiled: string[] = []
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any
      const schemaService = {
        compileSchema: (name: string, _schema: any) => {
          compiled.push(name)
        },
        getSchemaNames: () => new Set(compiled),
      }
      compileAllSchemas(logger, schemaService as any)
      assert.ok(compiled.includes('schema1'))
      assert.ok(compiled.includes('schema2'))
    })
  })
})
