import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { addFunction } from '../../function/function-runner.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import {
  AddonNotUsedError,
  ContextAwareRPCService,
  RPCNotFoundError,
} from '../rpc/rpc-runner.js'
import { getOrCreatePackageSingletonServices } from './addon-runner.js'
import { wireAddon } from './wire-addon.js'
import type { SecretService } from '../../services/secret-service.js'
import type { CoreSingletonServices } from '../../types/core.types.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const registerFunction = (
  funcName: string,
  packageName: string | null,
  result: unknown = funcName
) => {
  addFunction(funcName, { func: async () => result } as never, packageName)
  pikkuState(packageName, 'function', 'meta')[funcName] = {
    name: funcName,
    sessionless: true,
    permissions: [],
  } as never
  if (!packageName) {
    pikkuState(null, 'rpc', 'meta')[funcName] = funcName
  }
}

const host = (deploymentService?: unknown) =>
  new ContextAwareRPCService(
    { logger, deploymentService } as never,
    { wireType: 'http', wireId: 'host' } as never,
    { requiresAuth: false }
  )

const addonCaller = (
  namespace: string,
  packageName: string,
  deploymentService?: unknown
) =>
  new ContextAwareRPCService(
    { logger, deploymentService } as never,
    { wireType: 'http', wireId: namespace, addonNamespace: namespace } as never,
    { requiresAuth: false },
    packageName
  )

const wireAll = () => {
  wireAddon({
    name: 'mail',
    package: '@addon/mail',
    uses: { '@addon/stripe': 'stripe' },
  })
  wireAddon({
    name: 'stripe',
    package: '@addon/stripe',
    uses: { '@addon/crm': 'crm' },
  })
  wireAddon({ name: 'crm', package: '@addon/crm' })
  wireAddon({ name: 'vault', package: '@addon/vault' })
  registerFunction('send', '@addon/mail')
  registerFunction('charge', '@addon/stripe')
  registerFunction('contact', '@addon/crm')
  registerFunction('reveal', '@addon/vault')
  registerFunction('hostOnly', null, 'host-secret-data')
}

const callers = {
  rpc: (
    service: ContextAwareRPCService,
    name: string
  ): Promise<unknown> => service.rpc(name, {}),
  rpcWithWire: (
    service: ContextAwareRPCService,
    name: string
  ): Promise<unknown> => service.rpcWithWire(name, {}, {} as never),
}

describe('an addon can only call the addons it is wired to', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
    wireAll()
  })

  for (const [via, call] of Object.entries(callers)) {
    describe(`through ${via}`, () => {
      test('an addon it lists is reachable', async () => {
        assert.equal(
          await call(addonCaller('mail', '@addon/mail'), '@addon/stripe:charge'),
          'charge'
        )
      })

      test('a wired addon it does not list is refused', async () => {
        await assert.rejects(
          () => call(addonCaller('mail', '@addon/mail'), '@addon/vault:reveal'),
          AddonNotUsedError
        )
      })

      test('the same addon by its wired name is refused: only the declared package name opens the door', async () => {
        await assert.rejects(
          () => call(addonCaller('mail', '@addon/mail'), 'vault:reveal'),
          AddonNotUsedError
        )
        await assert.rejects(
          () => call(addonCaller('mail', '@addon/mail'), 'stripe:charge'),
          AddonNotUsedError
        )
      })

      test('an addon nobody wired is refused, not silently missing', async () => {
        await assert.rejects(
          () => call(addonCaller('mail', '@addon/mail'), '@addon/ghost:boo'),
          AddonNotUsedError
        )
      })

      test('what a listed addon itself uses is not reachable: no transitive access', async () => {
        await assert.rejects(
          () => call(addonCaller('mail', '@addon/mail'), '@addon/crm:contact'),
          AddonNotUsedError
        )
        assert.equal(
          await call(
            addonCaller('stripe', '@addon/stripe'),
            '@addon/crm:contact'
          ),
          'contact'
        )
      })

      test('a mapping to a name that is not wired finds nothing', async () => {
        wireAddon({
          name: 'broken',
          package: '@addon/broken',
          uses: { '@addon/ghost': 'ghost' },
        })
        await assert.rejects(
          () => call(addonCaller('broken', '@addon/broken'), '@addon/ghost:boo'),
          RPCNotFoundError
        )
      })

      test('an addon with no uses reaches no other addon', async () => {
        await assert.rejects(
          () => call(addonCaller('vault', '@addon/vault'), '@addon/mail:send'),
          AddonNotUsedError
        )
      })

      test('the host reaches every wired addon by name', async () => {
        assert.equal(await call(host(), 'vault:reveal'), 'reveal')
        assert.equal(await call(host(), 'mail:send'), 'send')
      })
    })
  }
})

describe('an addon cannot reach anything outside its wiring', () => {
  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', { logger } as never)
    wireAll()
  })

  for (const [via, call] of Object.entries(callers)) {
    describe(`through ${via}`, () => {
      test('its own functions answer to their bare name', async () => {
        assert.equal(await call(addonCaller('mail', '@addon/mail'), 'send'), 'send')
      })

      test('a host function is not reachable by bare name', async () => {
        await assert.rejects(
          () => call(addonCaller('mail', '@addon/mail'), 'hostOnly'),
          RPCNotFoundError
        )
        assert.equal(await call(host(), 'hostOnly'), 'host-secret-data')
      })

      test("another addon's function is not reachable by bare name", async () => {
        await assert.rejects(
          () => call(addonCaller('mail', '@addon/mail'), 'reveal'),
          RPCNotFoundError
        )
      })

      test('its own namespace cannot be used to reach a host function', async () => {
        await assert.rejects(
          () => call(addonCaller('mail', '@addon/mail'), 'mail:hostOnly'),
          RPCNotFoundError
        )
      })

      test('the deployment service is not an escape hatch for an addon', async () => {
        const invoked: string[] = []
        const deployment = {
          invoke: async (name: string) => {
            invoked.push(name)
            return 'leaked'
          },
        }
        await assert.rejects(
          () =>
            call(addonCaller('mail', '@addon/mail', deployment), 'hostOnly'),
          RPCNotFoundError
        )
        assert.deepEqual(invoked, [])
        assert.equal(await call(host(deployment), 'missingEverywhere'), 'leaked')
        assert.deepEqual(invoked, ['missingEverywhere'])
      })
    })
  }
})

describe('an addon can only start the workflows of addons it is wired to', () => {
  beforeEach(() => {
    resetPikkuState()
    wireAll()
  })

  const started: string[] = []
  const caller = (namespace: string, packageName: string) =>
    new ContextAwareRPCService(
      {
        logger,
        workflowService: {
          startWorkflow: async (name: string) => {
            started.push(name)
            return { runId: 'r' }
          },
        },
      } as never,
      { wireType: 'http', wireId: namespace, addonNamespace: namespace } as never,
      { requiresAuth: false },
      packageName
    )

  beforeEach(() => {
    started.length = 0
  })

  test('a listed addon, and its own, are startable', async () => {
    const mail = caller('mail', '@addon/mail')
    await mail.startWorkflow('@addon/stripe:refund', {})
    await mail.startWorkflow('mail:digest', {})
    assert.deepEqual(started, ['stripe:refund', 'mail:digest'])
  })

  test('an unlisted addon is refused and nothing starts', async () => {
    const mail = caller('mail', '@addon/mail')
    await assert.rejects(
      () => mail.startWorkflow('@addon/vault:wipe', {}),
      AddonNotUsedError
    )
    await assert.rejects(
      () => mail.startWorkflow('vault:wipe', {}),
      AddonNotUsedError
    )
    assert.deepEqual(started, [])
  })
})

const ADDON_A = '@addon/a'
const ADDON_B = '@addon/b'

const secretService = (): SecretService =>
  ({
    getSecret: async (key: string) => `value-of-${key}`,
    hasSecret: async () => true,
    setSecret: async () => {},
    deleteSecret: async () => {},
    getSecrets: async (keys: string[]) =>
      Object.fromEntries(keys.map((k) => [k, `value-of-${k}`])),
  }) as unknown as SecretService

const parent = () =>
  ({ config: {}, logger, secrets: secretService() }) as unknown as CoreSingletonServices

const registerSecretAddon = (packageName: string, declared: string[]) => {
  pikkuState(packageName, 'package', 'factories', {
    createSingletonServices: (async (_config: unknown, p: any) => ({
      ...p,
      seen: p.secrets,
    })) as never,
  })
  pikkuState(packageName, 'package', 'declaredSecrets', declared)
}

const secretsOf = async (namespace: string): Promise<SecretService> => {
  const cfg = pikkuState(null, 'addons', 'packages').get(namespace)!
  const services = (await getOrCreatePackageSingletonServices(
    cfg.package,
    parent(),
    { namespace, ...cfg } as never
  )) as any
  return services.seen
}

describe("an addon cannot read another addon's secrets, even when it exists", () => {
  beforeEach(() => {
    resetPikkuState()
    registerSecretAddon(ADDON_A, ['A_API_KEY'])
    registerSecretAddon(ADDON_B, ['B_API_KEY'])
    wireAddon({ name: 'a', package: ADDON_A })
    wireAddon({ name: 'b', package: ADDON_B })
  })

  test('each addon reads its own secret', async () => {
    assert.equal(
      await (await secretsOf('a')).getSecret('A_API_KEY'),
      'value-of-A_API_KEY'
    )
    assert.equal(
      await (await secretsOf('b')).getSecret('B_API_KEY'),
      'value-of-B_API_KEY'
    )
  })

  test("neither can read the other's, though both are real and set", async () => {
    await assert.rejects(
      async () => (await secretsOf('a')).getSecret('B_API_KEY'),
      /denied/i
    )
    await assert.rejects(
      async () => (await secretsOf('b')).getSecret('A_API_KEY'),
      /denied/i
    )
  })

  test("neither can read the other's through the batch read", async () => {
    await assert.rejects(
      async () => (await secretsOf('a')).getSecrets(['A_API_KEY', 'B_API_KEY']),
      /denied/i
    )
  })

  test('neither can overwrite or delete the other', async () => {
    const a = await secretsOf('a')
    await assert.rejects(async () => a.setSecret('B_API_KEY', 'x'))
    await assert.rejects(async () => a.deleteSecret('B_API_KEY'))
  })

  test('listing a dependency in uses grants none of its secrets', async () => {
    resetPikkuState()
    registerSecretAddon(ADDON_A, ['A_API_KEY'])
    registerSecretAddon(ADDON_B, ['B_API_KEY'])
    wireAddon({ name: 'a', package: ADDON_A, uses: { [ADDON_B]: 'b' } })
    wireAddon({ name: 'b', package: ADDON_B })
    await assert.rejects(
      async () => (await secretsOf('a')).getSecret('B_API_KEY'),
      /denied/i
    )
  })

  test('one package wired twice keeps each instance to its own override', async () => {
    resetPikkuState()
    registerSecretAddon(ADDON_A, ['TOKEN'])
    wireAddon({
      name: 'one',
      package: ADDON_A,
      secretOverrides: { TOKEN: 'ONE_TOKEN' },
    })
    wireAddon({
      name: 'two',
      package: ADDON_A,
      secretOverrides: { TOKEN: 'TWO_TOKEN' },
    })
    const one = await secretsOf('one')
    const two = await secretsOf('two')
    assert.equal(await one.getSecret('TOKEN'), 'value-of-ONE_TOKEN')
    assert.equal(await two.getSecret('TOKEN'), 'value-of-TWO_TOKEN')
    await assert.rejects(async () => one.getSecret('TWO_TOKEN'), /denied/i)
  })
})
