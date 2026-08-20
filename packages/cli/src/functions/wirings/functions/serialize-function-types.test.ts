import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeFunctionTypes } from './serialize-function-types.js'

const emit = (nodeCategories?: string[], credentialsTypeImport?: string) =>
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
    './pikku-auth-types.gen.js',
    undefined,
    nodeCategories,
    undefined,
    credentialsTypeImport,
    './pikku-middleware-types.gen.js'
  )

describe('serializeFunctionTypes', () => {
  // The permission and auth gates left for `#pikku/auth`. `PikkuPermission` is
  // still referenced by every function config, so it has to come back as a
  // type-only import — a value import would be a runtime cycle between the two
  // generated leaves.
  test('leaves the gates to the auth leaf and types against them', () => {
    const content = emit()

    assert.match(
      content,
      /import type \{ PikkuPermission \} from '\.\/pikku-auth-types\.gen\.js'/
    )
    for (const name of [
      'pikkuPermission',
      'pikkuPermissionFactory',
      'pikkuAuth',
      'addGlobalPermission',
    ]) {
      assert.doesNotMatch(
        content,
        new RegExp(`export const ${name}\\b`),
        `expected '${name}' to have moved to the auth leaf`
      )
    }
  })

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

  // `wire.getCredential('slack')` is only as typed as the map bound to the wire,
  // so the generated wire type has to pass `CredentialsMap` into `PikkuWire`.
  describe('credentials', () => {
    test('binds the generated CredentialsMap to every function wire', () => {
      const content = emit(
        undefined,
        "import type { CredentialsMap } from './credentials.js'"
      )

      assert.match(
        content,
        /import type \{ CredentialsMap \} from '\.\/credentials\.js'/
      )
      assert.doesNotMatch(
        content,
        /type CredentialsMap = Record<string, unknown>/
      )
      for (const wire of [
        /PikkuWire<In, Out, false, Session,.*TypedScenario<ScenarioOut>, TypedPersonas, CredentialsMap>/,
        /PikkuWire<In, Out, true, Session,.*TypedScenario, TypedPersonas, CredentialsMap>/,
      ]) {
        assert.match(content, wire)
      }
    })

    test('falls back to an untyped map when the project declares none', () => {
      const content = emit()

      assert.match(content, /type CredentialsMap = Record<string, unknown>/)
      assert.doesNotMatch(content, /import type \{ CredentialsMap \}/)
      assert.match(content, /TypedPersonas, CredentialsMap>/)
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
  // Which intersection this leaf carries is measured, not chosen: emit
  // declarations and `WiredServices` is named by 147 `.d.ts` files, while the
  // singleton intersection is named by none outside the leaves that declare it.
  // So that one moved to the leaves that use it, and this one stays exported —
  // unexport it and every wired module inlines it and fails TS2883 per member.
  test('only the intersection declaration emit names lives here', () => {
    const content = emit()

    assert.match(content, /^export type WiredServices =/m)
    assert.doesNotMatch(content, /WiredSingletonServices/)
  })
})
