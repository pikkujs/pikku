import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { findWireRemoteAddonSpecs } from './helpers.js'

const NAME = '@pikkustudio/addon-cloud-api'

describe('findWireRemoteAddonSpecs', () => {
  test('finds each literal with its range and line', () => {
    const source = `import { wireRemoteAddon } from '@pikku/core/addon'
wireRemoteAddon({
  name: 'cloudapi',
  package: '${NAME}@^1.4.0',
  serverUrl: 'https://api.example.com',
})
wireRemoteAddon({ name: 'legacy', package: "@pikkustudio/addon-registry", serverUrl: '' })
wireRemoteAddon({ name: 'dyn', package: PKG, serverUrl: '' })
`
    const specs = findWireRemoteAddonSpecs('wiring.ts', source)
    assert.equal(specs.length, 2)
    assert.equal(specs[0]!.namespace, 'cloudapi')
    assert.equal(specs[0]!.name, NAME)
    assert.equal(specs[0]!.range, '^1.4.0')
    assert.equal(specs[0]!.line, 4)
    assert.equal(specs[0]!.spec, `${NAME}@^1.4.0`)
    assert.equal(specs[1]!.range, undefined)
  })

  test('skips a package that does not parse', () => {
    assert.deepEqual(
      findWireRemoteAddonSpecs('w.ts', "wireRemoteAddon({ package: '' })"),
      []
    )
  })
})
