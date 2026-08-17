import { test, describe } from 'node:test'
import * as assert from 'assert'
import { TypesMap } from '../../../../../inspector/src/types-map.js'
import type { Logger } from '@pikku/core/services'
import type { HTTPWiringsMeta } from '@pikku/core/http'
import { serializeTypedHTTPWiringsMap } from './serialize-typed-http-map.js'

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  setLevel: () => {},
} as unknown as Logger

const refWiredRouteMeta = (): HTTPWiringsMeta =>
  ({
    get: {
      '/workflow-run/stream': {
        pikkuFuncId: 'console:streamWorkflowRun',
        route: '/workflow-run/stream',
        method: 'get',
        tags: [],
        middleware: [],
        permissions: [],
      },
    },
  }) as unknown as HTTPWiringsMeta

const serialize = (
  wiringsMeta: HTTPWiringsMeta,
  wireAddonDeclarations?: Map<string, { package: string }>
) =>
  serializeTypedHTTPWiringsMap(
    logger,
    '.pikku/pikku-http-map.gen.ts',
    {},
    new TypesMap(),
    wiringsMeta,
    new Map(),
    {},
    '.pikku/pikku-rpc-map.gen.ts',
    wireAddonDeclarations
  )

describe('serializeTypedHTTPWiringsMap', () => {
  /**
   * A `ref('console:streamWorkflowRun')` route records the addon's own function
   * id, and the addon's IO types are never in the consuming app's
   * resolvedIOTypes — they arrive through the generated FlattenedRPCMap under
   * the addon's namespace. The declared addon namespaces are what says so.
   */
  test('an addon-namespaced route resolves its types through FlattenedRPCMap', () => {
    const output = serialize(
      refWiredRouteMeta(),
      new Map([['console', { package: '@pikku/addon-console' }]])
    )
    assert.match(
      output,
      /FlattenedRPCMap\['console:streamWorkflowRun'\]\['input'\]/
    )
    assert.match(
      output,
      /FlattenedRPCMap\['console:streamWorkflowRun'\]\['output'\]/
    )
    assert.match(output, /import type \{ FlattenedRPCMap \}/)
  })

  test('a namespaced id from an undeclared addon is still a configuration error', () => {
    assert.throws(
      () => serialize(refWiredRouteMeta(), new Map()),
      /console:streamWorkflowRun not found in resolvedIOTypes/
    )
  })

  test('a local function with no resolved types is still a configuration error', () => {
    const meta = {
      get: {
        '/greet': {
          pikkuFuncId: 'greet',
          route: '/greet',
          method: 'get',
          tags: [],
          middleware: [],
          permissions: [],
        },
      },
    } as unknown as HTTPWiringsMeta
    assert.throws(
      () =>
        serialize(
          meta,
          new Map([['console', { package: '@pikku/addon-console' }]])
        ),
      /greet not found in resolvedIOTypes/
    )
  })
})
