import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeTypedRPCMap } from './serialize-typed-rpc-map.js'

describe('serializeTypedRPCMap', () => {
  const logger = {
    warn: () => {},
    info: () => {},
    debug: () => {},
    error: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  } as any

  const emptyTypesMap = {
    customTypes: new Map(),
    getTypeMeta: () => {
      throw new Error('type not found')
    },
  } as any

  test('uses strict voidish detection for RPCInvoke and RPCRemote', () => {
    const result = serializeTypedRPCMap(
      logger,
      '/tmp/pikku-rpc-map.gen.d.ts',
      {},
      emptyTypesMap,
      { health: 'health', list: 'list' },
      {
        health: { inputType: 'void', outputType: 'string' },
        list: { inputType: 'any', outputType: 'string' },
      }
    )

    assert.match(result, /type IsAny<T> = 0 extends \(1 & T\) \? true : false/)
    assert.match(result, /type IsVoidishInput<T> = IsAny<T> extends true/)
    assert.match(
      result,
      /\.\.\.args: IsVoidishInput<FlattenedRPCMap\[Name\]\['input'\]> extends true/
    )
  })
})
