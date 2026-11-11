import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRemoteAddonPackage } from './remote-addon-package.js'

describe('parseRemoteAddonPackage', () => {
  test('splits a scoped name from its range at the last @', () => {
    assert.deepEqual(
      parseRemoteAddonPackage('@pikkustudio/addon-cloud-api@^1.4.0'),
      { name: '@pikkustudio/addon-cloud-api', range: '^1.4.0' }
    )
  })

  test('splits an unscoped name from its range', () => {
    assert.deepEqual(parseRemoteAddonPackage('addon-mail@~2.0.1'), {
      name: 'addon-mail',
      range: '~2.0.1',
    })
  })

  test('a scoped name with no range keeps its leading @', () => {
    assert.deepEqual(parseRemoteAddonPackage('@pikkustudio/addon-registry'), {
      name: '@pikkustudio/addon-registry',
    })
  })

  test('an unscoped name with no range is the name alone', () => {
    assert.deepEqual(parseRemoteAddonPackage('addon-mail'), {
      name: 'addon-mail',
    })
  })

  test('refuses a trailing @ with no range', () => {
    assert.throws(
      () => parseRemoteAddonPackage('@scope/name@'),
      /no version range/
    )
  })
})
