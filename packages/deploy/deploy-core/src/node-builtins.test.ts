import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { nodeBuiltinExternals } from './node-builtins.js'
import { isNodeBuiltin } from './runtime-profile.js'

describe('nodeBuiltinExternals', () => {
  it('covers a builtin under both the bare and the node: spelling', () => {
    const externals = nodeBuiltinExternals()
    assert.ok(externals.includes('node:*'))
    assert.ok(externals.includes('buffer'))
  })

  it('covers builtins a hand-written list left out', () => {
    const externals = nodeBuiltinExternals()
    for (const missed of ['async_hooks', 'perf_hooks', 'timers', 'http2']) {
      assert.ok(
        externals.includes(missed),
        `${missed} would be bundled instead of resolved from the runtime`
      )
    }
  })

  it('appends provider-specific externals after the builtins', () => {
    const externals = nodeBuiltinExternals('@aws-sdk/*', '@smithy/*')
    assert.deepEqual(externals.slice(-2), ['@aws-sdk/*', '@smithy/*'])
  })
})

describe('built-ins under Bun', () => {
  it('does not take what only Bun builds in for a Node builtin', () => {
    for (const name of ['ws', 'undici', 'bun', 'bun:sqlite']) {
      assert.equal(isNodeBuiltin(name), false, name)
      assert.ok(!nodeBuiltinExternals().includes(name), name)
    }
    assert.ok(isNodeBuiltin('fs/promises'))
    assert.ok(isNodeBuiltin('node:sqlite'))
  })
})
