import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  assertGlobalMiddlewareImported,
  serializeMiddlewareImports,
} from './serialize-middleware-imports.js'
import type {
  InspectorMiddlewareState,
  InspectorHTTPState,
} from '@pikku/inspector'

const emptyMiddlewareState = (
  instances: InspectorMiddlewareState['instances'] = {},
  globalFiles: string[] = []
): InspectorMiddlewareState =>
  ({
    definitions: {},
    instances,
    tagMiddleware: new Map(),
    globalFiles: new Set(globalFiles),
  }) as unknown as InspectorMiddlewareState

const emptyHttpState = (): InspectorHTTPState =>
  ({
    routeMiddleware: new Map(),
  }) as unknown as InspectorHTTPState

describe('serializeMiddlewareImports global middleware', () => {
  // Regression: addGlobalMiddleware registrations live only in
  // middlewareState.instances (keyed global:middleware:N) with no associated
  // wire group. The per-unit --names filter strips the state.http.files
  // fallback, so without emitting them here a globally-registered middleware
  // (e.g. the CI-injected fabric telemetry middleware) never imports into a
  // deployed unit and silently no-ops at runtime.
  test('emits a side-effect import for a global middleware source file', () => {
    const state = emptyMiddlewareState({
      'global:middleware:0': {
        definitionId: 'telemetryMiddleware',
        sourceFile: '/project/src/__fabric_telemetry__/telemetry.wiring.ts',
        position: 0,
        isFactoryCall: false,
      },
    })

    const output = serializeMiddlewareImports(
      '/project/.pikku/middleware/pikku-middleware.gen.ts',
      state,
      emptyHttpState(),
      {}
    )

    assert.match(output, /Side-effect imports/)
    assert.match(output, /__fabric_telemetry__\/telemetry\.wiring/)
  })

  // `isFactoryCall` describes the array element — `betterAuthStatelessSession()`
  // rather than `betterAuthStatelessSession` — and says nothing about whether the
  // registration is deferred behind an exported factory. addGlobalMiddleware runs
  // at module evaluation either way, so both forms need the side-effect import.
  test('emits the import when the global entry is a factory call', () => {
    const state = emptyMiddlewareState({
      'global:middleware:0': {
        definitionId: 'betterAuthStatelessSession',
        sourceFile: '/project/pikku/auth/auth-middleware.gen.ts',
        position: 282,
        isFactoryCall: true,
      },
    })

    const output = serializeMiddlewareImports(
      '/project/.pikku/middleware/pikku-middleware.gen.ts',
      state,
      emptyHttpState(),
      {}
    )

    assert.match(output, /auth\/auth-middleware\.gen/)
  })

  test('deduplicates a global middleware shared across two instances', () => {
    const state = emptyMiddlewareState({
      'global:middleware:0': {
        definitionId: 'a',
        sourceFile: '/project/src/mw/global.ts',
        position: 0,
        isFactoryCall: false,
      },
      'global:middleware:1': {
        definitionId: 'b',
        sourceFile: '/project/src/mw/global.ts',
        position: 1,
        isFactoryCall: false,
      },
    })

    const output = serializeMiddlewareImports(
      '/project/.pikku/middleware/pikku-middleware.gen.ts',
      state,
      emptyHttpState(),
      {}
    )

    const occurrences = output.split('mw/global').length - 1
    assert.equal(occurrences, 1, 'shared global source should import once')
  })

  test('ignores non-global instances (tag middleware handled elsewhere)', () => {
    const state = emptyMiddlewareState({
      'tag:auth:0': {
        definitionId: 'authMw',
        sourceFile: '/project/src/mw/auth.ts',
        position: 0,
        isFactoryCall: false,
      },
    })

    const output = serializeMiddlewareImports(
      '/project/.pikku/middleware/pikku-middleware.gen.ts',
      state,
      emptyHttpState(),
      {}
    )

    assert.doesNotMatch(output, /mw\/auth/)
  })

  // `globalFiles` is the record that cannot be overwritten — the instance map is
  // keyed, and a key collision once erased an app's global registration
  // entirely. Emitting from the set means the import survives that.
  test('emits the import from globalFiles even with no instance entry', () => {
    const state = emptyMiddlewareState({}, [
      '/project/src/middleware/global.middleware.ts',
    ])

    const output = serializeMiddlewareImports(
      '/project/.pikku/middleware/pikku-middleware.gen.ts',
      state,
      emptyHttpState(),
      {}
    )

    assert.match(output, /middleware\/global\.middleware/)
  })

  test('imports a global source file exactly once when both records name it', () => {
    const sourceFile = '/project/src/middleware/global.middleware.ts'
    const state = emptyMiddlewareState(
      {
        'global:middleware:0': {
          definitionId: 'mw',
          sourceFile,
          position: 0,
          isFactoryCall: false,
        },
      },
      [sourceFile]
    )

    const output = serializeMiddlewareImports(
      '/project/.pikku/middleware/pikku-middleware.gen.ts',
      state,
      emptyHttpState(),
      {}
    )

    assert.equal(output.split('global.middleware').length - 1, 1)
  })
})

// A deployed unit that misses a global middleware import does not fail to
// build — it serves every authenticated route a 401 with a clean build log.
// This check is the thing that makes that loud.
describe('assertGlobalMiddlewareImported', () => {
  test('passes when every global source file has a side-effect import', () => {
    assertGlobalMiddlewareImported(
      '/project/.pikku/middleware/pikku-middleware.gen.ts',
      "import '../../src/middleware/global.middleware.js'",
      new Map([
        [
          '/project/src/middleware/global.middleware.ts',
          '../../src/middleware/global.middleware.js',
        ],
      ])
    )
  })

  test('passes when there is no global middleware at all', () => {
    assertGlobalMiddlewareImported('/out.gen.ts', '', new Map())
  })

  test('throws naming the file whose import is missing', () => {
    assert.throws(
      () =>
        assertGlobalMiddlewareImported(
          '/project/.pikku/middleware/pikku-middleware.gen.ts',
          "import '../../src/middleware/other.js'",
          new Map([
            [
              '/project/src/middleware/global.middleware.ts',
              '../../src/middleware/global.middleware.js',
            ],
          ])
        ),
      (error: Error) => {
        assert.match(error.message, /addGlobalMiddleware/)
        assert.match(error.message, /src\/middleware\/global\.middleware\.ts/)
        return true
      }
    )
  })
})
