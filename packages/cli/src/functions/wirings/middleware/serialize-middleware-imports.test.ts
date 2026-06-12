import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeMiddlewareImports } from './serialize-middleware-imports.js'
import type {
  InspectorMiddlewareState,
  InspectorHTTPState,
} from '@pikku/inspector'

const emptyMiddlewareState = (
  instances: InspectorMiddlewareState['instances'] = {}
): InspectorMiddlewareState =>
  ({
    definitions: {},
    instances,
    tagMiddleware: new Map(),
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
})
