import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import type { FeatureFlagSource } from '@pikku/core/services'

import {
  VIRTUAL_USER_SIGN_IN_OPT_IN_ENV,
  VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE,
  DEV_VIRTUAL_USER_SIGN_IN_ENV,
} from './virtual-user-sign-in-gate.js'
import { devSwitcherOn, listDevVirtualUsers } from './dev-virtual-users.js'

const flags = (enabled: boolean): FeatureFlagSource => ({
  snapshot: async () => ({
    devSwitcher: { enabled, rolloutPercent: null, overrides: {} },
  }),
})

describe('devSwitcherOn', () => {
  const saved = {
    dev: process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV],
    optIn: process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV],
  }
  beforeEach(() => {
    delete process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV]
    delete process.env[VIRTUAL_USER_SIGN_IN_OPT_IN_ENV]
  })
  afterEach(() => {
    for (const [key, value] of [
      [DEV_VIRTUAL_USER_SIGN_IN_ENV, saved.dev],
      [VIRTUAL_USER_SIGN_IN_OPT_IN_ENV, saved.optIn],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test('off when virtual user sign-in is not enabled, whatever the flag says', async () => {
    assert.equal(await devSwitcherOn(flags(true)), false)
  })

  test('on under pikku dev without consulting the flag', async () => {
    process.env[DEV_VIRTUAL_USER_SIGN_IN_ENV] = 'true'
    assert.equal(await devSwitcherOn(flags(false)), true)
  })

  test('a deployed stage follows the devSwitcher flag', async () => {
    assert.equal(
      await devSwitcherOn(flags(false), VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE),
      false
    )
    assert.equal(
      await devSwitcherOn(flags(true), VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE),
      true
    )
    assert.equal(
      await devSwitcherOn(undefined, VIRTUAL_USER_SIGN_IN_OPT_IN_VALUE),
      false
    )
  })
})

describe('listDevVirtualUsers', () => {
  const virtualUsers = [
    {
      id: 'ana',
      name: 'Ana',
      jobTitle: 'Dispatcher',
      email: 'ana@x',
      app: 'web',
    },
    { id: 'bo', name: 'Bo', email: 'bo@x', app: 'admin' },
    { id: 'cy', email: 'cy@x' },
    { id: 'no-email', name: 'Nobody' },
    { id: 'off', name: 'Off', email: 'off@x', runnable: false },
  ]

  test('offers only virtual users the virtual user endpoint accepts, with no address', () => {
    assert.deepEqual(listDevVirtualUsers(virtualUsers), [
      { id: 'ana', name: 'Ana', jobTitle: 'Dispatcher' },
      { id: 'bo', name: 'Bo', jobTitle: null },
      { id: 'cy', name: 'cy', jobTitle: null },
    ])
  })

  test('narrows to the app when it declares its own virtual users', () => {
    assert.deepEqual(
      listDevVirtualUsers(virtualUsers, 'admin').map(
        (virtualUser) => virtualUser.id
      ),
      ['bo']
    )
  })

  test('falls back to every virtual user when the app declares none', () => {
    assert.deepEqual(
      listDevVirtualUsers(virtualUsers, 'mobile').map(
        (virtualUser) => virtualUser.id
      ),
      ['ana', 'bo', 'cy']
    )
  })
})
