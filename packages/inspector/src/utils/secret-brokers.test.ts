import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { isSecretBrokerFunction } from './secret-brokers.js'
import { computeSecretBrokers } from './post-process.js'
import type { InspectorState } from '../types.js'

describe('isSecretBrokerFunction', () => {
  test('admits the console secret-admin functions', () => {
    assert.ok(isSecretBrokerFunction('pikkuConsoleGetSecret'))
    assert.ok(isSecretBrokerFunction('pikkuConsoleSetSecret'))
    assert.ok(isSecretBrokerFunction('pikkuConsoleHasSecret'))
  })

  test('admits them when namespaced by an addon', () => {
    assert.ok(isSecretBrokerFunction('pikku:pikkuConsoleGetSecret'))
  })

  test('admits nothing else', () => {
    assert.equal(isSecretBrokerFunction('pikkuConsoleGetVariable'), false)
    assert.equal(isSecretBrokerFunction('httpRequest'), false)
    assert.equal(isSecretBrokerFunction('myFunction'), false)
  })

  test('is not fooled by a name that merely contains a broker name', () => {
    assert.equal(isSecretBrokerFunction('notPikkuConsoleGetSecret'), false)
    assert.equal(isSecretBrokerFunction('pikkuConsoleGetSecretly'), false)
  })
})

describe('computeSecretBrokers', () => {
  const stateWith = (meta: Record<string, any>) =>
    ({ functions: { meta } }) as unknown as InspectorState

  test('flags a broker so the runner keeps its secrets', () => {
    const state = stateWith({
      pikkuConsoleGetSecret: { pikkuFuncId: 'pikkuConsoleGetSecret' },
    })
    computeSecretBrokers(state)
    assert.equal(state.functions.meta.pikkuConsoleGetSecret!.secretBroker, true)
  })

  test('leaves an ordinary function unflagged', () => {
    const state = stateWith({ createTodo: { pikkuFuncId: 'createTodo' } })
    computeSecretBrokers(state)
    assert.equal(state.functions.meta.createTodo!.secretBroker, undefined)
  })

  test('falls back to the meta key when there is no pikkuFuncId', () => {
    const state = stateWith({ pikkuConsoleSetSecret: {} })
    computeSecretBrokers(state)
    assert.equal(state.functions.meta.pikkuConsoleSetSecret!.secretBroker, true)
  })
})
