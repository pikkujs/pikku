import * as assert from 'assert'
import { describe, test } from 'node:test'
import { serializeChannelTypes } from './channels/serialize-channel-types.js'
import { serializeFunctionTypes } from './functions/serialize-function-types.js'
import { serializeGatewayTypes } from './gateway/serialize-gateway-types.js'
import { serializeHTTPTypes } from './http/serialize-http-types.js'
import { serializeMCPTypes } from './mcp/serialize-mcp-types.js'
import { serializeQueueTypes } from './queue/serialize-queue-types.js'
import { serializeSchedulerTypes } from './scheduler/serialize-scheduler-types.js'
import { serializeTriggerTypes } from './triggers/serialize-trigger-types.js'

/**
 * An addon declares functions and contracts; the host application wires them.
 * `#pikku/cli` already disappears for an addon, and every other leaf leaked its
 * `wire*` half — importable from an addon, meaningless there, and impossible to
 * reach the host's registry from.
 *
 * The leaf barrel is a blanket `export *`, so the subset is decided here, at
 * the point the file is generated, rather than by a list something has to keep
 * in step.
 */

const PATH = './pikku-types.gen.js'

const declares = (source: string, name: string): boolean =>
  new RegExp(
    `export (const|function|type|class)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`
  ).test(source)

describe('the addon surface omits wiring', () => {
  const cases: Array<{
    leaf: string
    app: () => string
    addon: () => string
    wiring: string[]
    kept: string[]
  }> = [
    {
      leaf: 'http',
      app: () => serializeHTTPTypes(PATH),
      addon: () => serializeHTTPTypes(PATH, { addon: true }),
      wiring: ['wireHTTP', 'wireHTTPRoutes'],
      kept: ['defineHTTPRoutes', 'addHTTPMiddleware', 'cors'],
    },
    {
      leaf: 'channel',
      app: () => serializeChannelTypes(PATH),
      addon: () => serializeChannelTypes(PATH, undefined, { addon: true }),
      wiring: ['wireChannel'],
      kept: ['defineChannelRoutes', 'pikkuChannelFunc'],
    },
    {
      leaf: 'queue',
      app: () => serializeQueueTypes(PATH),
      addon: () => serializeQueueTypes(PATH, { addon: true }),
      wiring: ['wireQueueWorker'],
      kept: [],
    },
    {
      leaf: 'scheduler',
      app: () => serializeSchedulerTypes(PATH),
      addon: () => serializeSchedulerTypes(PATH, { addon: true }),
      wiring: ['wireScheduler'],
      kept: [],
    },
    {
      leaf: 'trigger',
      app: () => serializeTriggerTypes(PATH, 'SingletonServices'),
      addon: () =>
        serializeTriggerTypes(PATH, 'SingletonServices', { addon: true }),
      wiring: ['wireTrigger', 'wireTriggerSource'],
      kept: ['pikkuTriggerFunc'],
    },
    {
      leaf: 'mcp',
      app: () => serializeMCPTypes(PATH),
      addon: () => serializeMCPTypes(PATH, { addon: true }),
      wiring: ['wireMCPResource', 'wireMCPPrompt'],
      kept: ['pikkuMCPToolFunc', 'pikkuMCPPromptFunc', 'pikkuMCPResourceFunc'],
    },
    {
      leaf: 'gateway',
      app: () => serializeGatewayTypes(PATH, 'SingletonServices'),
      addon: () =>
        serializeGatewayTypes(PATH, 'SingletonServices', { addon: true }),
      wiring: ['wireGateway'],
      kept: [],
    },
  ]

  for (const each of cases) {
    test(`an application still wires ${each.leaf}`, () => {
      const source = each.app()
      for (const name of each.wiring) {
        assert.ok(declares(source, name), `${name} missing from the app leaf`)
      }
    })

    test(`an addon cannot wire ${each.leaf}`, () => {
      const source = each.addon()
      for (const name of each.wiring) {
        assert.ok(
          !declares(source, name),
          `${name} is still reachable from an addon`
        )
      }
    })

    if (each.kept.length > 0) {
      test(`an addon still defines ${each.leaf}`, () => {
        const source = each.addon()
        for (const name of each.kept) {
          assert.ok(
            declares(source, name),
            `${name} was taken away from the addon leaf`
          )
        }
      })
    }
  }
})

describe('installing an addon is the host application’s job', () => {
  const functionTypes = (addon: boolean) =>
    serializeFunctionTypes(
      PATH,
      'UserSession',
      PATH,
      'SingletonServices',
      PATH,
      'WireServices',
      PATH,
      PATH,
      PATH,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { addon }
    )

  test('an application installs addons', () => {
    assert.match(functionTypes(false), /export \{[^}]*wireAddon[^}]*\}/)
  })

  test('an addon does not install addons', () => {
    assert.doesNotMatch(functionTypes(true), /\bwireAddon\b/)
    assert.doesNotMatch(functionTypes(true), /\bwireRemoteAddon\b/)
  })
})
