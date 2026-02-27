import { describe, test } from 'node:test'
import assert from 'node:assert'
import { LocalVariablesService } from './local-variables.js'

describe('LocalVariablesService', () => {
  test('should get a variable', () => {
    const service = new LocalVariablesService({ MY_VAR: 'hello' })
    assert.strictEqual(service.get('MY_VAR'), 'hello')
  })

  test('should return undefined for missing variable', () => {
    const service = new LocalVariablesService({})
    assert.strictEqual(service.get('MISSING'), undefined)
  })

  test('should set a variable', () => {
    const service = new LocalVariablesService({})
    service.set('KEY', 'value')
    assert.strictEqual(service.get('KEY'), 'value')
  })

  test('should delete a variable', () => {
    const service = new LocalVariablesService({ KEY: 'val' })
    service.delete('KEY')
    assert.strictEqual(service.get('KEY'), undefined)
  })

  test('should check if variable exists', () => {
    const service = new LocalVariablesService({ KEY: 'val' })
    assert.strictEqual(service.has('KEY'), true)
    assert.strictEqual(service.has('MISSING'), false)
  })

  test('should get all variables', () => {
    const vars = { A: '1', B: '2' }
    const service = new LocalVariablesService(vars)
    assert.deepStrictEqual(service.getAll(), vars)
  })

  test('should get JSON variable', () => {
    const service = new LocalVariablesService({ DATA: '{"key":"val"}' })
    const result = service.getJSON('DATA')
    assert.deepStrictEqual(result, { key: 'val' })
  })

  test('should return undefined for missing JSON variable', () => {
    const service = new LocalVariablesService({})
    assert.strictEqual(service.getJSON('MISSING'), undefined)
  })

  test('should set JSON variable', () => {
    const service = new LocalVariablesService({})
    service.setJSON('DATA', { key: 'val' })
    assert.strictEqual(service.get('DATA'), '{"key":"val"}')
  })

  test('should handle has with undefined value', () => {
    const service = new LocalVariablesService({ KEY: undefined })
    assert.strictEqual(service.has('KEY'), false)
  })
})
