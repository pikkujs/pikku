import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { SERVER_READY_MARKER } from '@pikku/deploy'

import { StandaloneProviderAdapter } from './adapter.js'
import { DATA_DIR_ENV, PARENT_PID_ENV } from './runtime/parent-watch.js'

const baseContext = {
  unit: { name: 'app', role: 'function' },
  unitDir: '/build/app',
  bootstrapPath: './.pikku/pikku-bootstrap.gen.js',
  configImport: `import { createConfig } from './config.js'`,
  configVar: 'createConfig',
  servicesImport: `import { createSingletonServices } from './services.js'`,
  servicesVar: 'createSingletonServices',
  singletonServicesImport: '',
  servicesType: 'Record<string, unknown>',
  mcpImport: '',
  mcpServerOption: '',
} as never

const entries = (['node', 'bun'] as const).map((runtime) => ({
  runtime,
  source: new StandaloneProviderAdapter({ runtime }).generateEntrySource(
    baseContext
  ),
}))

describe('the handshake a desktop shell reads off its sidecar', () => {
  for (const { runtime, source } of entries) {
    test(`the ${runtime} entry announces readiness with the shared marker`, () => {
      assert.ok(
        source.includes(SERVER_READY_MARKER),
        'a shell waiting on `pikku: ready` would hang forever without it'
      )
      assert.match(
        source,
        /serverReadyLine|pikku: ready on http:\/\//,
        'the line must carry a URL, not just the marker'
      )
    })

    test(`the ${runtime} entry reports the port the server bound, not the one requested`, () => {
      assert.match(
        source,
        /server\.port/,
        'PORT=0 is how the shell avoids a bind race, so the requested port is useless'
      )
      assert.doesNotMatch(
        source,
        /ready on http:\/\/\$\{hostname\}:\$\{port\}/,
        'announcing the requested port re-introduces the race'
      )
    })

    test(`the ${runtime} entry announces readiness only after the server starts`, () => {
      const readyAt = source.indexOf(SERVER_READY_MARKER)
      const startAt = source.indexOf('await server.start()')
      assert.ok(startAt > -1, 'the entry must start the server')
      assert.ok(
        readyAt > startAt,
        'readiness printed before start() is a lie a parent will act on'
      )
    })

    test(`the ${runtime} entry installs the orphan guard`, () => {
      assert.match(
        source,
        /watchParentProcess\(\)/,
        'a hard crash of the shell would otherwise orphan this process'
      )
      assert.match(source, /@pikku\/deploy-standalone\/runtime/)
    })

    test(`the ${runtime} entry still defaults to a fixed port outside a shell`, () => {
      assert.match(
        source,
        /process\.env\.PORT \|\| '3000'/,
        'an ordinary server deploy must keep its predictable port'
      )
    })
  }

  test('the environment contract is named in one place', () => {
    assert.equal(PARENT_PID_ENV, 'PIKKU_PARENT_PID')
    assert.equal(DATA_DIR_ENV, 'PIKKU_DATA_DIR')
  })
})
