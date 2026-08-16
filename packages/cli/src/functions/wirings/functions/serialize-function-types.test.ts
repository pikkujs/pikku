import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeFunctionTypes } from './serialize-function-types.js'

const emit = (nodeCategories?: string[]) =>
  serializeFunctionTypes(
    "import type { Session } from './session.js'",
    'Session',
    "import type { SingletonServices } from './singleton-services.js'",
    'SingletonServices',
    "import type { Services } from './wire-services.js'",
    'Services',
    "import type { FlattenedRPCMap, TypedPikkuRPC } from './rpc-map.js'",
    "import type { RequiredSingletonServices, RequiredWireServices } from './required-services.js'",
    "import type { Config } from './config.js'",
    undefined,
    undefined,
    nodeCategories
  )

describe('serializeFunctionTypes', () => {
  test('emits pikkuListFunc without a named list-function type', () => {
    const content = emit()

    assert.match(content, /ListInput, ListOutput/)
    assert.doesNotMatch(content, /PikkuListFunction/)
    assert.match(content, /export const pikkuListFunc = </)
    assert.match(
      content,
      /PikkuFunctionConfig<\s*ListInput<F, S>,\s*ListOutput<Row>/
    )
  })

  // Generated code is read by people and resolved by bundlers, so each name has
  // to arrive from the subpath that declares it rather than from whichever
  // barrel happened to re-export it.
  test('imports each type from the subpath that owns it', () => {
    const content = emit()

    for (const [name, subpath] of [
      ['CorePikkuMiddleware', 'middleware'],
      ['PickRequired', 'utils'],
      ['ListInput, ListOutput', 'function'],
      ['CorePermissionGroup', 'function'],
      ['PikkuWire, SecretlessServices', 'types'],
    ] as const) {
      assert.match(
        content,
        new RegExp(`import type \\{ ${name} \\} from '@pikku/core/${subpath}'`),
        `expected '${name}' to come from '@pikku/core/${subpath}'`
      )
    }
  })

  // Re-implementing a core factory means the generated copy drifts from it. The
  // `__priority` stamp the middleware runner orders by is applied by core's
  // `pikkuMiddleware` alone, so a generated one that rebuilds the body instead
  // of calling it silently drops every priority an app declares.
  describe('pikkuMiddleware', () => {
    test('delegates to core rather than re-implementing it', () => {
      const content = emit()

      assert.match(
        content,
        /import \{[^}]*pikkuMiddleware as pikkuMiddlewareCore[^}]*\} from '@pikku\/core\/middleware'/s
      )
      assert.match(content, /pikkuMiddlewareCore\(middleware\)/)
      assert.doesNotMatch(
        content,
        /typeof middleware === 'function' \? middleware : middleware\.func/
      )
    })

    test('accepts and emits the priority the runtime orders by', () => {
      const content = emit()

      assert.match(
        content,
        /import type \{[^}]*MiddlewarePriority[^}]*\} from '@pikku\/core\/middleware'/s
      )
      assert.match(content, /export type \{ MiddlewarePriority \}/)
      assert.match(
        content,
        /type PikkuMiddlewareConfig<[^]*?priority\?: MiddlewarePriority/
      )
    })
  })

  describe('node config', () => {
    test('narrows category to the addon categories the project declared', () => {
      assert.match(
        emit(['Communication', 'Utility']),
        /export type NodeConfig = \{\n {2}displayName: string\n {2}category: 'Communication' \| 'Utility'/
      )
    })

    // `category: string` is what `CoreNodeConfig` already says, so a project
    // with no declared categories gets the core shape by another name.
    test('falls back to string when the project declares none', () => {
      assert.match(emit(), /export type NodeConfig = \{[^}]*category: string/)
    })

    // The narrowing only means something where people actually write `node:`.
    // Core types that field as `CoreNodeConfig`, whose category is `string`, so
    // every config type that reaches a user has to override it — otherwise
    // `NodeConfig` is generated for two sibling barrels and nothing else.
    test('every user-facing config type overrides core `node`', () => {
      const content = emit(['Communication'])
      for (const config of [
        'PikkuFunctionConfig',
        'PikkuFunctionSessionlessConfig',
        'PikkuFunctionConfigWithSchema',
        'PikkuFunctionSessionlessConfigWithSchema',
      ]) {
        const body = content.slice(
          content.indexOf(`type ${config}<`),
          content.indexOf(`type ${config}<`) + 1400
        )
        assert.ok(
          /'node'/.test(body) && /node\?: NodeConfig/.test(body),
          `expected '${config}' to omit core's \`node\` and re-add it as NodeConfig`
        )
      }
    })
  })
})
