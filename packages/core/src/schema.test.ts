import { test, describe, before, beforeEach } from 'node:test'
import * as assert from 'assert'
import {
  addSchema,
  getSchema,
  applyDefaultsFromSchema,
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

      addSchema('numericSchema', {
        properties: {
          year: { type: 'integer' },
          ratio: { type: 'number' },
          maybeYear: { type: ['integer', 'null'] },
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

    test('should coerce a whole-number string for integer and number', () => {
      const data = { year: '2027', ratio: '2027' } as any
      coerceTopLevelDataFromSchema('numericSchema', data)
      assert.strictEqual(data.year, 2027)
      assert.strictEqual(data.ratio, 2027)
    })

    test('should coerce a negative number', () => {
      const data = { year: '-5', ratio: '-0.25' } as any
      coerceTopLevelDataFromSchema('numericSchema', data)
      assert.strictEqual(data.year, -5)
      assert.strictEqual(data.ratio, -0.25)
    })

    test('should not coerce a value it cannot reproduce exactly', () => {
      // Every one of these reads as a number, and every one of them prints
      // back as different text than it arrived as. Coercing would mean the
      // function silently chose a value the caller did not send.
      for (const rewritten of ['1e3', '007', '+5', '2027.50', ' 12 ', '-0']) {
        const data = { ratio: rewritten } as any
        coerceTopLevelDataFromSchema('numericSchema', data)
        assert.strictEqual(data.ratio, rewritten)
      }
    })

    test('should not coerce an integer too large to survive a double', () => {
      // 2^53 + 1. Number() reads it as 9007199254740992, one less than it
      // says. An id sent as a string is usually sent that way for exactly
      // this reason, so quietly rounding it is data corruption.
      const data = { year: '9007199254740993' } as any
      coerceTopLevelDataFromSchema('numericSchema', data)
      assert.strictEqual(data.year, '9007199254740993')
    })

    test('should coerce an integer that does survive a double', () => {
      const data = { year: '9007199254740991' } as any
      coerceTopLevelDataFromSchema('numericSchema', data)
      assert.strictEqual(data.year, 9007199254740991)
    })

    test('should coerce a fraction for number but leave it for integer', () => {
      const data = { year: '2027.5', ratio: '2027.5' } as any
      coerceTopLevelDataFromSchema('numericSchema', data)
      assert.strictEqual(data.year, '2027.5')
      assert.strictEqual(data.ratio, 2027.5)
    })

    for (const junk of [
      '',
      ' ',
      'abc',
      '2027abc',
      '0x10',
      'Infinity',
      '1e999',
    ]) {
      test(`should leave ${JSON.stringify(junk)} untouched`, () => {
        const data = { year: junk, ratio: junk } as any
        coerceTopLevelDataFromSchema('numericSchema', data)
        assert.strictEqual(data.year, junk)
        assert.strictEqual(data.ratio, junk)
      })
    }

    test('should leave an already-numeric value untouched', () => {
      const data = { year: 2027, ratio: 1.5 } as any
      coerceTopLevelDataFromSchema('numericSchema', data)
      assert.strictEqual(data.year, 2027)
      assert.strictEqual(data.ratio, 1.5)
    })

    test('should not add keys the data never had', () => {
      const data = { ratio: '1' } as any
      coerceTopLevelDataFromSchema('numericSchema', data)
      assert.deepStrictEqual(Object.keys(data), ['ratio'])
    })

    test('should leave a union type alone, as the other cases do', () => {
      const data = { maybeYear: '2027' } as any
      coerceTopLevelDataFromSchema('numericSchema', data)
      assert.strictEqual(data.maybeYear, '2027')
    })
  })

  describe('applyDefaultsFromSchema', () => {
    before(() => {
      addSchema('defaultsSchema', {
        properties: {
          page: { type: 'number', default: 1 },
          limit: { type: 'number', default: 50 },
          addons: { type: 'array', default: [] },
          mode: { type: 'string', default: 'manual' },
          enabled: { type: 'boolean', default: true },
          name: { type: 'string' },
        },
      })

      addSchema('noDefaultsSchema', {
        properties: { name: { type: 'string' } },
      })

      addSchema('booleanPropSchema', {
        properties: { isActive: true, page: { type: 'number', default: 1 } },
      })
    })

    test('should fill in absent properties from their default', () => {
      const data = applyDefaultsFromSchema('defaultsSchema', {})
      assert.strictEqual(data.page, 1)
      assert.strictEqual(data.limit, 50)
      assert.strictEqual(data.mode, 'manual')
      assert.strictEqual(data.enabled, true)
    })

    test('should not overwrite a supplied value', () => {
      const data = applyDefaultsFromSchema('defaultsSchema', {
        page: 7,
        limit: 200,
      })
      assert.strictEqual(data.page, 7)
      assert.strictEqual(data.limit, 200)
    })

    // `false` and `0` are the values a truthiness check silently replaces, and
    // the reason this tests presence rather than falsiness.
    test('should not overwrite a supplied falsy value', () => {
      const data = applyDefaultsFromSchema('defaultsSchema', {
        page: 0,
        enabled: false,
      })
      assert.strictEqual(data.page, 0)
      assert.strictEqual(data.enabled, false)
    })

    test('should fill defaults into nullish data', () => {
      assert.strictEqual(
        applyDefaultsFromSchema('defaultsSchema', undefined).page,
        1
      )
      assert.strictEqual(
        applyDefaultsFromSchema('defaultsSchema', null).limit,
        50
      )
    })

    test('should leave properties without a default absent', () => {
      const data = applyDefaultsFromSchema('defaultsSchema', {})
      assert.ok(!('name' in data))
    })

    // Two requests sharing one array default would let the first request's
    // pushes show up in the second.
    test('should clone object and array defaults per call', () => {
      const first = applyDefaultsFromSchema('defaultsSchema', {})
      const second = applyDefaultsFromSchema('defaultsSchema', {})
      first.addons.push('leaked')
      assert.deepStrictEqual(second.addons, [])
    })

    test('should return the same data when the schema has no defaults', () => {
      const data = { name: 'x' }
      assert.strictEqual(
        applyDefaultsFromSchema('noDefaultsSchema', data),
        data
      )
    })

    test('should return data untouched for an unknown schema', () => {
      const data = { name: 'x' }
      assert.strictEqual(applyDefaultsFromSchema('nonExistent', data), data)
    })

    test('should leave a primitive body for the validator to reject', () => {
      assert.strictEqual(
        applyDefaultsFromSchema('defaultsSchema', 'nope'),
        'nope'
      )
    })

    test('should skip boolean schema properties', () => {
      const data = applyDefaultsFromSchema('booleanPropSchema', {})
      assert.strictEqual(data.page, 1)
      assert.ok(!('isActive' in data))
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

    test('strips undefined-valued properties before validating', async () => {
      addSchema('undefinedProps', {
        properties: { name: { type: 'string' }, count: { type: 'number' } },
      })
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any
      let seen: any
      const schemaService = {
        compileSchema: async () => {},
        validateSchema: async (_name: string, data: any) => {
          seen = data
        },
        getSchemaNames: () => new Set<string>(),
      }
      await validateSchema(logger, schemaService, 'undefinedProps', {
        name: 'ada',
        count: undefined,
      })
      assert.deepStrictEqual(seen, { name: 'ada' })
      assert.ok(!('count' in seen))
    })

    test('strips undefined nested in objects and arrays', async () => {
      addSchema('nestedUndefined', { properties: {} })
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any
      let seen: any
      const schemaService = {
        compileSchema: async () => {},
        validateSchema: async (_name: string, data: any) => {
          seen = data
        },
        getSchemaNames: () => new Set<string>(),
      }
      await validateSchema(logger, schemaService, 'nestedUndefined', {
        nested: { keep: 1, drop: undefined },
        list: [{ keep: 2, drop: undefined }],
      })
      assert.deepStrictEqual(seen, {
        nested: { keep: 1 },
        list: [{ keep: 2 }],
      })
    })

    test('leaves Date instances intact while stripping', async () => {
      addSchema('withDate', { properties: {} })
      const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      } as any
      const when = new Date('2020-01-01T00:00:00.000Z')
      let seen: any
      const schemaService = {
        compileSchema: async () => {},
        validateSchema: async (_name: string, data: any) => {
          seen = data
        },
        getSchemaNames: () => new Set<string>(),
      }
      await validateSchema(logger, schemaService, 'withDate', {
        when,
        drop: undefined,
      })
      assert.ok(seen.when instanceof Date)
      assert.equal(seen.when.getTime(), when.getTime())
      assert.ok(!('drop' in seen))
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
