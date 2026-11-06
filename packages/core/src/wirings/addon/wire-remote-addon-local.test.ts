import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { addonMayReach } from './addon-reach.js'
import { wireRemoteAddon } from './wire-remote-addon.js'

describe('a remote addon with a local package', () => {
  beforeEach(() => {
    resetPikkuState()
  })

  test('local is build-time only: the registry entry is the same with or without it', () => {
    const base = {
      package: '@acme/addon-cloud-api@^1.0.0',
      serverUrl: 'https://cloud.example.com',
    }
    wireRemoteAddon({
      name: 'with',
      ...base,
      local: { package: '@acme/addon-cloud', ui: true },
    })
    wireRemoteAddon({ name: 'without', ...base })
    const packages = pikkuState(null, 'addons', 'packages')
    const withLocal = packages.get('with')!
    assert.equal('local' in withLocal, false)
    assert.equal('uses' in withLocal, false)
    assert.deepEqual(withLocal, { ...packages.get('without')! })
  })

  test('the entry names the contract package, not the local one', () => {
    wireRemoteAddon({
      name: 'cloud',
      package: '@acme/addon-cloud-api@^1.0.0',
      serverUrl: 'https://cloud.example.com',
      local: { package: '@acme/addon-cloud', ui: true },
    })
    const entry = pikkuState(null, 'addons', 'packages').get('cloud')!
    assert.equal(entry.package, '@acme/addon-cloud-api')
    assert.equal(entry.remote, true)
  })

  test('a remote addon reaches only itself', () => {
    wireRemoteAddon({
      name: 'cloud',
      package: '@acme/addon-cloud-api@^1.0.0',
      serverUrl: 'https://cloud.example.com',
      local: { package: '@acme/addon-cloud', ui: true },
    })
    assert.equal(addonMayReach('cloud', 'cloud:listStages'), true)
    assert.equal(addonMayReach('cloud', 'studio:pushAll'), false)
  })
})
