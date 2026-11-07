import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCliInvocation } from './cli-invocation.js'

describe('CLI invocation', () => {
  test('a node install runs its own bin', () => {
    const inv = resolveCliInvocation({
      execPath: '/usr/bin/node',
      execArgv: ['--enable-source-maps'],
      moduleUrl: 'file:///p/cli/dist/src/utils/cli-invocation.js',
      argv1: '/somewhere/else',
      exists: (p) => p === '/p/cli/dist/bin/pikku.js',
    })
    assert.deepEqual(inv, {
      command: '/usr/bin/node',
      args: ['--enable-source-maps', '/p/cli/dist/bin/pikku.js'],
    })
  })

  test('a bun-compiled binary is started directly', () => {
    const inv = resolveCliInvocation({
      execPath: '/opt/homebrew/bin/pikku',
      execArgv: [],
      moduleUrl: 'file:///$bunfs/root/pikku',
      argv1: '/$bunfs/root/pikku',
      exists: () => false,
    })
    assert.deepEqual(inv, { command: '/opt/homebrew/bin/pikku', args: [] })
  })

  test('falls back to argv[1] when the bin is not beside the module', () => {
    const inv = resolveCliInvocation({
      execPath: '/bun',
      execArgv: [],
      moduleUrl: 'file:///p/cli/src/utils/cli-invocation.ts',
      argv1: '/p/cli/bin/pikku.ts',
      exists: () => false,
    })
    assert.deepEqual(inv, { command: '/bun', args: ['/p/cli/bin/pikku.ts'] })
  })
})
