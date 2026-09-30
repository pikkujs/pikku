import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { runChannelLifecycleWithMiddleware } from './channel-common.js'

const singletonServices = {
  logger: { info() {}, warn() {}, error() {}, debug() {} },
} as any

const registerLifecycle = (funcId: string, onRun: () => void) => {
  addFunction(funcId, {
    func: async () => {
      onRun()
      return undefined
    },
  } as never)
  pikkuState(null, 'function', 'meta')[funcId] = {
    pikkuFuncId: funcId,
    sessionless: true,
    inputSchemaName: null,
    outputSchemaName: null,
  } as never
}

const runLifecycle = (auth: boolean | undefined, funcId: string) =>
  runChannelLifecycleWithMiddleware({
    channelConfig: { name: 'presence', auth } as any,
    meta: { pikkuFuncId: funcId } as any,
    lifecycleConfig: {},
    lifecycleType: 'connect',
    services: singletonServices,
    channel: {},
    // No userSession — the peer is unauthenticated.
  })

describe('channel lifecycle honours the channel auth flag', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', singletonServices)
  })

  test('an auth:true channel does not run onConnect for an unauthenticated peer', async () => {
    let ran = false
    registerLifecycle('onConnectSecure', () => {
      ran = true
    })
    await assert.rejects(runLifecycle(true, 'onConnectSecure'))
    assert.equal(
      ran,
      false,
      'the lifecycle function must not run without a session'
    )
  })

  test('an auth:false channel runs onConnect for an unauthenticated peer', async () => {
    let ran = false
    registerLifecycle('onConnectOpen', () => {
      ran = true
    })
    await runLifecycle(false, 'onConnectOpen')
    assert.equal(
      ran,
      true,
      'an explicitly public channel still runs its lifecycle'
    )
  })

  test('auth defaults to required when unset', async () => {
    let ran = false
    registerLifecycle('onConnectDefault', () => {
      ran = true
    })
    await assert.rejects(runLifecycle(undefined, 'onConnectDefault'))
    assert.equal(
      ran,
      false,
      'unset auth is session-required, mirroring wireChannel'
    )
  })
})
