import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { wireChannel } from './channel-runner.js'

const registeredFunc = (funcId: string) =>
  pikkuState(null, 'function', 'functions').get(funcId)

const wire = (channel: any) => {
  resetPikkuState()
  pikkuState(null, 'channel', 'meta', {
    shapes: {
      name: 'shapes',
      route: '/shapes',
      input: null,
      connect: { pikkuFuncId: 'shapes__connect' },
      disconnect: { pikkuFuncId: 'shapes__disconnect' },
      message: { pikkuFuncId: 'shapes__message' },
      messageWirings: {},
    },
  } as any)
  wireChannel({ name: 'shapes', route: '/shapes', ...channel })
}

/**
 * knowledge: decisions/internals/channel-message-handlers-accept-three-config-shapes.md
 */
describe('every channel handler shape registers a callable function config', () => {
  const handler = async () => undefined

  test('a direct function config registers as-is', () => {
    wire({ onConnect: { func: handler } })

    assert.equal(typeof registeredFunc('shapes__connect')?.func, 'function')
  })

  test('a wrapper around a function config registers the inner config', () => {
    wire({ onConnect: { func: { func: handler }, middleware: [] } })

    // Registering the wrapper itself leaves `.func` an object, and the function
    // runner calls `.func(...)` — that is a TypeError at connect time.
    assert.equal(
      typeof registeredFunc('shapes__connect')?.func,
      'function',
      'the wrapper was registered instead of the config it wraps'
    )
  })

  test('onDisconnect unwraps the same way', () => {
    wire({ onDisconnect: { func: { func: handler }, middleware: [] } })

    assert.equal(typeof registeredFunc('shapes__disconnect')?.func, 'function')
  })

  test('onMessage unwraps the same way', () => {
    wire({ onMessage: { func: { func: handler } } })

    assert.equal(typeof registeredFunc('shapes__message')?.func, 'function')
  })

  test('a simple wrapper — a function plus sibling middleware — stays whole', () => {
    wire({ onConnect: { func: handler, middleware: [] } })

    const registered = registeredFunc('shapes__connect')
    assert.equal(typeof registered?.func, 'function')
    assert.ok(
      'middleware' in (registered as object),
      'the sibling middleware must survive registration'
    )
  })
})
