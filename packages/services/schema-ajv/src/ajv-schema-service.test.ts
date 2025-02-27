import { test, describe } from 'node:test'
import * as assert from 'node:assert/strict'
import { Logger } from '@pikku/core' // Mock Logger for testing
import { AjvSchemaService } from './ajv-schema-service.js'

const mockLogger = {
  debug: (message) => console.log(`[DEBUG]: ${message}`),
} as unknown as Logger

describe('AjvSchemaService', () => {
  test('compileSchema adds a new schema and validates successfully', async () => {
    const service = new AjvSchemaService(mockLogger)

    const schemaName = 'TestSchema'
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      required: ['name'],
    }

    service.compileSchema(schemaName, schema)

    const schemaNames = service.getSchemaNames()
    assert.ok(schemaNames.has(schemaName), 'Schema name should be registered.')

    service.validateSchema(schemaName, { name: 'Test User' }) // No exception expected
  })

  test('compileSchema throws an error for invalid schema', async () => {
    const service = new AjvSchemaService(mockLogger)

    const invalidSchema = {
      type: 'object',
      properties: {
        name: { type: 'invalid-type' }, // Invalid type
      },
    }

    assert.throws(
      () => service.compileSchema('InvalidSchema', invalidSchema),
      /data\/properties\/name\/type/,
      'Expected error when compiling invalid schema'
    )
  })

  // test('validateSchema throws an error for invalid data', async () => {
  //     const service = new AjvSchemaService(mockLogger);

  //     const schemaName = 'TestSchema';
  //     const schema = {
  //         type: 'object',
  //         properties: {
  //             age: { type: 'integer', minimum: 18 },
  //         },
  //         required: ['age'],
  //     };

  //     service.compileSchema(schemaName, schema);

  //     assert.throws(
  //         () => service.validateSchema(schemaName, { age: 16 }),
  //         /should be >= 18/,
  //         'Expected validation error for age below 18'
  //     );
  // });

  test('validateSchema throws error for missing schema', async () => {
    const service = new AjvSchemaService(mockLogger)

    assert.throws(
      () => service.validateSchema('NonExistentSchema', {}),
      /Missing validator for NonExistentSchema/,
      'Expected error when validating against a missing schema'
    )
  })

  test('getSchemaNames returns all registered schema names', async () => {
    const service = new AjvSchemaService(mockLogger)

    const schema1 = { type: 'object', properties: { key: { type: 'string' } } }
    const schema2 = {
      type: 'object',
      properties: { value: { type: 'number' } },
    }

    service.compileSchema('Schema1', schema1)
    service.compileSchema('Schema2', schema2)

    const schemaNames = service.getSchemaNames()

    assert.deepStrictEqual(
      Array.from(schemaNames),
      ['Schema1', 'Schema2'],
      'Expected both schema names to be registered.'
    )
  })
})
