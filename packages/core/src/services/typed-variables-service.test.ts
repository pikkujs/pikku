import { describe, test } from 'node:test'
import assert from 'node:assert'
import { TypedVariablesService } from './typed-variables-service.js'
import { LocalVariablesService } from './local-variables.js'

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

  test('should delegate getJSON to underlying service', () => {
    const service = createService({ DATA: '{"key":"val"}' })
    assert.deepStrictEqual(service.getJSON('DATA'), { key: 'val' })
  })

  test('should delegate setJSON to underlying service', () => {
    const service = createService()
    service.setJSON('DATA', { key: 'val' })
    assert.strictEqual(service.get('DATA'), '{"key":"val"}')
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
