import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nodeBuiltinExternals } from './node-builtins.js'
import { isNodeBuiltin } from './runtime-profile.js'

describe('node builtins', () => {
  test('covers Node builtins under both spellings', () => {
    assert.ok(isNodeBuiltin('fs'))
    assert.ok(isNodeBuiltin('fs/promises'))
    assert.ok(isNodeBuiltin('node:sqlite'))
    assert.ok(nodeBuiltinExternals().includes('buffer'))
  })

  test('does not take what only Bun builds in for a Node builtin', () => {
    for (const name of ['ws', 'undici', 'bun', 'bun:sqlite']) {
      assert.equal(isNodeBuiltin(name), false, name)
      assert.ok(!nodeBuiltinExternals().includes(name), name)
    }
  })

  test('keeps the extra externals a caller names', () => {
    assert.ok(nodeBuiltinExternals('ws').includes('ws'))
  })
})
