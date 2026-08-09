import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { wireGateway } from './gateway-runner.js'

const wireWebsocketGateway = (name: string) => {
  resetPikkuState()
  wireGateway({
    name,
    type: 'websocket',
    route: `/${name}`,
    adapter: { name: 'test', parse: () => null, send: async () => {} },
    func: { func: async () => undefined },
  } as any)
  return pikkuState(null, 'channel', 'meta')[name]!
}

describe('a gateway-wired websocket channel writes complete channel meta', () => {
  test('the fields every channel reader indexes are present', () => {
    const meta = wireWebsocketGateway('chatGateway')

    // channel-handler.ts indexes messageWirings without a guard, and the
    // serverless and local runners read disconnect directly.
    assert.deepEqual(
      meta.messageWirings,
      {},
      'messageWirings must be an object — channel-handler indexes it unguarded'
    )
    assert.equal(meta.disconnect, null)
    assert.equal(meta.input, null)
  })

  test('it is marked as gateway-wired', () => {
    assert.equal(wireWebsocketGateway('flagged').gateway, true)
  })

  test('connect and message point at the generated handlers', () => {
    const meta = wireWebsocketGateway('handlers')

    assert.equal(meta.connect?.pikkuFuncId, 'gateway__handlers__connect')
    assert.equal(meta.message?.pikkuFuncId, 'gateway__handlers__message')
  })
})
