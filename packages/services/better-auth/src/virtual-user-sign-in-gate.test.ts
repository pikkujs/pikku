import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import {
  DEV_VIRTUAL_USER_SIGN_IN_ENV,
  VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
  resolveVirtualUserSignIn,
} from './virtual-user-sign-in-gate.js'

describe('resolveVirtualUserSignIn', () => {
  const previousNodeEnv = process.env.NODE_ENV
  afterEach(() => {
    delete process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV]
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  })

  test('pikku dev opens the gate and may provision', () => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
    delete process.env.NODE_ENV
    assert.deepEqual(resolveVirtualUserSignIn(), {
      enabled: true,
      reason: 'pikku-dev',
      mayProvision: true,
      nearMissOptIn: false,
    })
  })

  test('the dev flag is ignored in production', () => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
    process.env.NODE_ENV = 'production'
    assert.deepEqual(resolveVirtualUserSignIn(), {
      enabled: false,
      reason: 'disabled',
      mayProvision: false,
      nearMissOptIn: false,
    })
  })

  test('in production the explicit opt-in still opens it, without provisioning', () => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
    process.env.NODE_ENV = 'production'
    const gate = resolveVirtualUserSignIn(VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE)
    assert.equal(gate.enabled, true)
    assert.equal(gate.reason, 'allow-outside-dev-env')
    assert.equal(gate.mayProvision, false)
  })

  test('a near-miss opt-in is flagged and shut', () => {
    const gate = resolveVirtualUserSignIn('yes')
    assert.equal(gate.enabled, false)
    assert.equal(gate.nearMissOptIn, true)
  })
})
