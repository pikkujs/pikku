import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState } from '../../pikku-state.js'
import { addonMayReach } from './addon-reach.js'
import { wireRemoteAddon } from './wire-remote-addon.js'

beforeEach(() => {
  resetPikkuState()
  wireRemoteAddon({
    name: 'cloud',
    package: '@pikkustudio/addon-cloud-api@^1.0.0',
    serverUrl: 'https://cloud.example.com',
  })
})

describe('wireRemoteAddon reach', () => {
  test('a remote addon may reach its own namespace', () => {
    assert.equal(addonMayReach('cloud', 'cloud:listStages'), true)
  })

  test('a remote addon cannot reach another addon today', () => {
    assert.equal(addonMayReach('cloud', 'studio:pushAll'), false)
  })

  test.todo(
    "wireRemoteAddon accepts uses: { '@pikkustudio/addon-studio': 'studio' }, so cloud may reach studio:pushAll and nothing outside uses"
  )
})
