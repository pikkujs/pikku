import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'

import type { FeatureFlagSource } from '@pikku/core/services'

import {
  ACTOR_SIGN_IN_OPT_IN_ENV,
  ACTOR_SIGN_IN_OPT_IN_VALUE,
  DEV_ACTOR_SIGN_IN_ENV,
} from './actor-sign-in-gate.js'
import { devSwitcherOn, listDevActors } from './dev-actors.js'

const flags = (enabled: boolean): FeatureFlagSource => ({
  snapshot: async () => ({
    devSwitcher: { enabled, rolloutPercent: null, overrides: {} },
  }),
})

describe('devSwitcherOn', () => {
  const saved = {
    dev: process.env[DEV_ACTOR_SIGN_IN_ENV],
    optIn: process.env[ACTOR_SIGN_IN_OPT_IN_ENV],
  }
  beforeEach(() => {
    delete process.env[DEV_ACTOR_SIGN_IN_ENV]
    delete process.env[ACTOR_SIGN_IN_OPT_IN_ENV]
  })
  afterEach(() => {
    for (const [key, value] of [
      [DEV_ACTOR_SIGN_IN_ENV, saved.dev],
      [ACTOR_SIGN_IN_OPT_IN_ENV, saved.optIn],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test('off when actor sign-in is not enabled, whatever the flag says', async () => {
    assert.equal(await devSwitcherOn(flags(true)), false)
  })

  test('on under pikku dev without consulting the flag', async () => {
    process.env[DEV_ACTOR_SIGN_IN_ENV] = 'true'
    assert.equal(await devSwitcherOn(flags(false)), true)
  })

  test('a deployed stage follows the devSwitcher flag', async () => {
    assert.equal(
      await devSwitcherOn(flags(false), ACTOR_SIGN_IN_OPT_IN_VALUE),
      false
    )
    assert.equal(
      await devSwitcherOn(flags(true), ACTOR_SIGN_IN_OPT_IN_VALUE),
      true
    )
    assert.equal(
      await devSwitcherOn(undefined, ACTOR_SIGN_IN_OPT_IN_VALUE),
      false
    )
  })
})

describe('listDevActors', () => {
  const personas = [
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

  test('offers only personas the persona endpoint accepts, with no address', () => {
    assert.deepEqual(listDevActors(personas), [
      { id: 'ana', name: 'Ana', jobTitle: 'Dispatcher' },
      { id: 'bo', name: 'Bo', jobTitle: null },
      { id: 'cy', name: 'cy', jobTitle: null },
    ])
  })

  test('narrows to the app when it declares its own personas', () => {
    assert.deepEqual(
      listDevActors(personas, 'admin').map((actor) => actor.id),
      ['bo']
    )
  })

  test('falls back to every persona when the app declares none', () => {
    assert.deepEqual(
      listDevActors(personas, 'mobile').map((actor) => actor.id),
      ['ana', 'bo', 'cy']
    )
  })
})
