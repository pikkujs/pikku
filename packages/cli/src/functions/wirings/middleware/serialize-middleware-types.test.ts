import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeMiddlewareTypes } from './serialize-middleware-types.js'

const emit = () =>
  serializeMiddlewareTypes(
    '../function/pikku-function-types.gen.js',
    "import type { RequiredSingletonServices } from '../pikku-services.gen.js'",
    'my-addon'
  )

describe('serializeMiddlewareTypes', () => {
  // Middleware used to be spread across four leaves: the definer and the tag
  // and global registrations on `#pikku/function`, the HTTP registration and
  // `cors` on `#pikku/http`, the channel variants on `#pikku/channel`, and the
  // agent hooks on `#pikku/agent`. Declaring a middleware and attaching it
  // therefore meant importing from two places for no reason a reader could
  // name — middleware is one concept whatever it ends up attached to.
  test('every way to declare or register middleware is on one leaf', () => {
    const content = emit()

    for (const name of [
      'PikkuMiddleware',
      'pikkuMiddleware',
      'pikkuMiddlewareFactory',
      'addGlobalMiddleware',
      'addTagMiddleware',
      'addHTTPMiddleware',
      'addChannelMiddleware',
      'PikkuChannelMiddleware',
      'pikkuChannelMiddleware',
      'pikkuChannelMiddlewareFactory',
      'pikkuAgentMiddleware',
    ]) {
      assert.match(
        content,
        new RegExp(`export (const|type) ${name}\\b`),
        `expected the middleware leaf to declare '${name}'`
      )
    }

    assert.match(
      content,
      /export \{ cors, analyticsOrigin, authAPIKey, authBearer, authCookie \} from '@pikku\/core\/middleware'/,
      'the middleware leaf is the only door to core middleware, so every one it ships reaches through it'
    )
  })

  // Re-implementing a core factory means the generated copy drifts from it. The
  // `__priority` stamp the middleware runner orders by is applied by core's
  // `pikkuMiddleware` alone, so a generated one that rebuilds the body instead
  // of calling it silently drops every priority an app declares.
  test('pikkuMiddleware delegates to core rather than re-implementing it', () => {
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

  // The registrations are namespaced so an addon's middleware is attributed to
  // the addon rather than to the host that installed it.
  test('registrations carry the package name', () => {
    const content = emit()

    assert.match(
      content,
      /addGlobalMiddlewareCore\(middleware as any, 'my-addon'\)/
    )
    assert.match(
      content,
      /addTagMiddlewareCore\(tag, middleware as any, 'my-addon'\)/
    )
  })

  test('agent middleware is typed against the singleton services', () => {
    const content = emit()

    assert.match(
      content,
      /export const pikkuAgentMiddleware = <\s*State extends Record<string, unknown> = Record<string, unknown>,\s*RequiredServices extends SingletonServices = WiredSingletonServices,\s*>/
    )
    assert.doesNotMatch(
      content,
      /export const pikkuAgentMiddleware = <[^]*?RequiredServices extends Services = Services/
    )
  })

  test('types against the function leaf without importing a value from it', () => {
    assert.match(
      emit(),
      /import type \{ Services, SingletonServices \} from '\.\.\/function\/pikku-function-types\.gen\.js'/
    )
  })

  // `WiredSingletonServices` is named by no `.d.ts` outside the leaves that
  // declare it, so the function leaf keeps it private and this leaf derives its
  // own from the services file.
  test('derives the wired singleton intersection rather than importing it', () => {
    const content = emit()

    assert.match(
      content,
      /import type \{ RequiredSingletonServices \} from '\.\.\/pikku-services\.gen\.js'/
    )
    assert.match(
      content,
      /^type WiredSingletonServices = RequiredSingletonServices & SingletonServices$/m
    )
  })
})
