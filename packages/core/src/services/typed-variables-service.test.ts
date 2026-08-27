import { describe, test } from 'node:test'
import assert from 'node:assert'
import { TypedVariablesService } from './typed-variables-service.js'
import { LocalVariablesService } from './local-variables.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'

describe('TypedVariablesService', () => {
  const createService = (vars: Record<string, string | undefined> = {}) => {
    const underlying = new LocalVariablesService(vars)
    const meta = {
      DB_URL: { name: 'DB_URL', displayName: 'Database URL' },
      API_KEY: { name: 'API_KEY', displayName: 'API Key' },
    }
    return new TypedVariablesService(underlying, meta)
  }

  test('should delegate get to underlying service', () => {
    const service = createService({ DB_URL: 'postgres://...' })
    assert.strictEqual(service.get('DB_URL'), 'postgres://...')
  })

  test('should delegate set to underlying service', () => {
    const service = createService()
    service.set('DB_URL', 'new-value')
    assert.strictEqual(service.get('DB_URL'), 'new-value')
  })

  test('should delegate has to underlying service', () => {
    const service = createService({ DB_URL: 'val' })
    assert.strictEqual(service.has('DB_URL'), true)
    assert.strictEqual(service.has('MISSING'), false)
  })

  test('should delegate delete to underlying service', () => {
    const service = createService({ DB_URL: 'val' })
    service.delete('DB_URL')
    assert.strictEqual(service.has('DB_URL'), false)
  })

  test('should delegate get to underlying service', () => {
    const service = createService({ DATA: '{"key":"val"}' })
    assert.deepStrictEqual(service.get('DATA'), { key: 'val' })
  })

  test('should delegate set to underlying service', () => {
    const service = createService()
    service.set('DATA', { key: 'val' })
    assert.deepStrictEqual(service.get('DATA'), { key: 'val' })
  })

  test('should get all status for configured variables', async () => {
    const service = createService({ DB_URL: 'postgres://...' })
    const status = await service.getAllStatus()
    assert.strictEqual(status.length, 2)
    const dbStatus = status.find((s) => s.variableId === 'DB_URL')!
    assert.strictEqual(dbStatus.isConfigured, true)
    assert.strictEqual(dbStatus.displayName, 'Database URL')
    const apiStatus = status.find((s) => s.variableId === 'API_KEY')!
    assert.strictEqual(apiStatus.isConfigured, false)
  })

  test('should get missing variables', async () => {
    const service = createService({ DB_URL: 'val' })
    const missing = await service.getMissing()
    assert.strictEqual(missing.length, 1)
    assert.strictEqual(missing[0].variableId, 'API_KEY')
  })

  test('should return empty missing when all configured', async () => {
    const service = createService({ DB_URL: 'val', API_KEY: 'key' })
    const missing = await service.getMissing()
    assert.strictEqual(missing.length, 0)
  })
})

/**
 * Stands in for `z.enum([...]).default(...)`: a schema that answers `undefined`
 * with a value rather than an issue. Core declares no schema library of its
 * own, so the contract under test is Standard Schema's, not Zod's.
 */
const withDefault = <T>(value: T): StandardSchemaV1<unknown, T> => ({
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (input: unknown) =>
      input === undefined ? { value } : { value: input as T },
  },
})

const noDefault: StandardSchemaV1<unknown, string> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (input: unknown) =>
      typeof input === 'string'
        ? { value: input }
        : { issues: [{ message: 'expected a string' }] },
  },
}

describe('TypedVariablesService schema defaults', () => {
  const createService = (vars: Record<string, string | undefined> = {}) =>
    new TypedVariablesService(new LocalVariablesService(vars), {
      GITHUB_BASE_URL: {
        name: 'GITHUB_BASE_URL',
        displayName: 'GitHub Base URL',
        schema: withDefault('https://api.github.com'),
      },
      API_KEY: {
        name: 'API_KEY',
        displayName: 'API Key',
        schema: noDefault,
      },
      // The form code generation emits, deferred past the import cycle.
      REGION: {
        name: 'REGION',
        displayName: 'Region',
        schema: () => withDefault('eu-west-1'),
      },
    })

  test('resolves a declared default when the host sets nothing', async () => {
    const service = createService()
    assert.strictEqual(
      await service.get('GITHUB_BASE_URL'),
      'https://api.github.com'
    )
  })

  test('prefers the host value over the default', async () => {
    const service = createService({ GITHUB_BASE_URL: 'https://ghe.internal' })
    assert.strictEqual(
      await service.get('GITHUB_BASE_URL'),
      'https://ghe.internal'
    )
  })

  test('stays undefined when the schema carries no default', async () => {
    const service = createService()
    assert.strictEqual(await service.get('API_KEY'), undefined)
  })

  test('resolves a default behind a thunk', async () => {
    const service = createService()
    assert.strictEqual(await service.get('REGION'), 'eu-west-1')
  })

  test('a defaulted variable is not missing', async () => {
    const service = createService()
    const missing = await service.getMissing()
    assert.deepStrictEqual(
      missing.map((v) => v.variableId),
      ['API_KEY']
    )
  })

  test('status separates having a default from being configured', async () => {
    const service = createService()
    const status = await service.getAllStatus()
    const github = status.find((s) => s.variableId === 'GITHUB_BASE_URL')!
    assert.strictEqual(github.isConfigured, false)
    assert.strictEqual(github.hasDefault, true)
    const apiKey = status.find((s) => s.variableId === 'API_KEY')!
    assert.strictEqual(apiKey.hasDefault, false)
  })
})
