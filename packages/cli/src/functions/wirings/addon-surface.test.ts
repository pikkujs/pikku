import * as assert from 'assert'
import { describe, test } from 'node:test'
import { serializeChannelTypes } from './channels/serialize-channel-types.js'
import { serializeAddonInstallTypes } from './functions/serialize-addon-types.js'
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
const MIDDLEWARE_PATH = './pikku-middleware-types.gen.js'
const AUTH_PATH = './pikku-auth-types.gen.js'

const declares = (source: string, name: string): boolean =>
  new RegExp(
    `export (const|function|type|class)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`
  ).test(source)

const cases: Array<{
  leaf: string
  app: () => string
  addon: () => string
  wiring: string[]
  kept: string[]
}> = [
  {
    leaf: 'http',
    app: () => serializeHTTPTypes(PATH, MIDDLEWARE_PATH, AUTH_PATH),
    addon: () =>
      serializeHTTPTypes(PATH, MIDDLEWARE_PATH, AUTH_PATH, { addon: true }),
    wiring: ['wireHTTP', 'wireHTTPRoutes'],
    kept: ['defineHTTPRoutes'],
  },
  {
    leaf: 'channel',
    app: () => serializeChannelTypes(PATH, MIDDLEWARE_PATH, AUTH_PATH),
    addon: () =>
      serializeChannelTypes(PATH, MIDDLEWARE_PATH, AUTH_PATH, {
        addon: true,
      }),
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
    app: () => serializeSchedulerTypes(PATH, MIDDLEWARE_PATH),
    addon: () =>
      serializeSchedulerTypes(PATH, MIDDLEWARE_PATH, { addon: true }),
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
    app: () => serializeMCPTypes(PATH, MIDDLEWARE_PATH, AUTH_PATH),
    addon: () =>
      serializeMCPTypes(PATH, MIDDLEWARE_PATH, AUTH_PATH, { addon: true }),
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

describe('the addon surface omits wiring', () => {
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
  // `wireAddon` used to sit on the function leaf, gated on the project not
  // being an addon. Installing an addon and authoring one are the same concept
  // from opposite ends, so both halves are `#pikku/addon` and which half a
  // project gets is decided by which kind of project it is.
  test('an application installs addons from the addon leaf', () => {
    const source = serializeAddonInstallTypes()
    assert.match(source, /\bwireAddon\b/)
    assert.match(source, /\bwireRemoteAddon\b/)
  })

  test('the function leaf no longer installs anything', () => {
    for (const addon of [false, true]) {
      const source = serializeFunctionTypes(
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
        MIDDLEWARE_PATH,
        { addon }
      )
      assert.doesNotMatch(source, /\bwireAddon\b/)
      assert.doesNotMatch(source, /\bwireRemoteAddon\b/)
    }
  })
})

/**
 * Generated output is compiled with `noUnusedLocals`, so a declaration the
 * addon half no longer references is a build error in every addon package
 * rather than dead weight. Cutting a `wire*` out routinely orphans the private
 * type it was the only reader of, and the error surfaces in the user's project
 * rather than here.
 */
const unreferenced = (source: string): string[] => {
  const declared = new Set<string>()

  for (const block of source.matchAll(/import(?: type)? \{([^}]*)\} from/g)) {
    for (const binding of block[1]!.split(',')) {
      const name = binding
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (name) declared.add(name)
    }
  }
  for (const declaration of source.matchAll(/^type (\w+)/gm)) {
    declared.add(declaration[1]!)
  }

  return [...declared].filter((name) => {
    const uses = source.match(new RegExp(`\\b${name}\\b`, 'g'))
    return (uses?.length ?? 0) < 2
  })
}

describe('the addon half leaves nothing declared but unread', () => {
  for (const each of cases) {
    test(`${each.leaf} compiles under noUnusedLocals for an addon`, () => {
      assert.deepEqual(unreferenced(each.addon()), [])
    })

    test(`${each.leaf} compiles under noUnusedLocals for an application`, () => {
      assert.deepEqual(unreferenced(each.app()), [])
    })
  }
})
