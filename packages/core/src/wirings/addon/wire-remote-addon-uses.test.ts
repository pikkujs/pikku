import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  addonMayReach,
  mapAddonCall,
  AddonNotUsedError,
} from './addon-reach.js'
import { wireRemoteAddon } from './wire-remote-addon.js'

describe('a remote addon with uses', () => {
  beforeEach(() => {
    resetPikkuState()
    wireRemoteAddon({
      name: 'cloud',
      package: '@acme/addon-cloud-api@^1.0.0',
      serverUrl: 'https://cloud.example.com',
      uses: { '@acme/addon-studio': 'studio' },
      local: { package: '@acme/addon-cloud', ui: true },
    })
  })

  test('stores uses on the registry entry and nothing from local', () => {
    const entry = pikkuState(null, 'addons', 'packages').get('cloud')!
    assert.deepEqual(entry.uses, { '@acme/addon-studio': 'studio' })
    assert.equal(entry.package, '@acme/addon-cloud-api')
    assert.equal(entry.remote, true)
    assert.equal('local' in entry, false)
  })

  test('may reach itself and the addon it uses', () => {
    assert.equal(addonMayReach('cloud', 'cloud:listStages'), true)
    assert.equal(addonMayReach('cloud', 'studio:pushAll'), true)
  })

  test('may not reach a name outside uses', () => {
    assert.equal(addonMayReach('cloud', 'vault:reveal'), false)
  })

  test('maps an alias through uses and refuses an unmapped prefix', () => {
    assert.equal(
      mapAddonCall('cloud', '@acme/addon-studio:pushAll'),
      'studio:pushAll'
    )
    assert.throws(
      () => mapAddonCall('cloud', 'vault:reveal'),
      AddonNotUsedError
    )
  })

  test('without uses it reaches only itself', () => {
    wireRemoteAddon({
      name: 'plain',
      package: '@acme/addon-cloud-api@^1.0.0',
      serverUrl: 'https://cloud.example.com',
    })
    assert.equal(addonMayReach('plain', 'plain:x'), true)
    assert.equal(addonMayReach('plain', 'studio:pushAll'), false)
  })
})
