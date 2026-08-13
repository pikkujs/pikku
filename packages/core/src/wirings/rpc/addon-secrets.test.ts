import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { pikkuState, resetPikkuState } from '../../pikku-state.js'
import { getOrCreatePackageSingletonServices } from './addon-runner.js'
import { wireAddon } from './wire-addon.js'
import type { SecretService } from '../../services/secret-service.js'
import type { CredentialService } from '../../services/credential-service.js'
import type { CoreSingletonServices } from '../../types/core.types.js'

const ADDON_PACKAGE = '@addon/example'

const createSecretService = (): SecretService =>
  ({
    getSecret: async (key: string) => `value-of-${key}` as never,
    hasSecret: async () => true,
    setSecret: async () => {},
    deleteSecret: async () => {},
    getSecrets: async (keys: string[]) =>
      Object.fromEntries(keys.map((k) => [k, `value-of-${k}`])) as never,
  }) as SecretService

const createCredentialService = (): CredentialService =>
  ({
    get: async (name: string) => `credential-of-${name}`,
    set: async () => {},
    delete: async () => {},
    has: async () => true,
    getAll: async () => ({ slack: 'a', stripe: 'b' }),
    getUsersWithCredential: async () => ['user-1'],
    getAllUsers: async () => ['user-1'],
  }) as unknown as CredentialService

const createParentServices = () =>
  ({
    config: {},
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    secrets: createSecretService(),
    credentialService: createCredentialService(),
  }) as unknown as CoreSingletonServices

/**
 * Registers an addon package whose singleton factory hands back whatever
 * secrets service the host decided it should see.
 */
const registerAddon = (
  declaredSecrets: string[] | null,
  declaredCredentials?: string[]
) => {
  pikkuState(ADDON_PACKAGE, 'package', 'factories', {
    createSingletonServices: (async (_config: unknown, parent: any) => ({
      ...parent,
      secretsSeenByAddon: parent.secrets,
      credentialsSeenByAddon: parent.credentialService,
    })) as never,
  })
  if (declaredSecrets) {
    pikkuState(ADDON_PACKAGE, 'package', 'declaredSecrets', declaredSecrets)
  }
  if (declaredCredentials) {
    pikkuState(
      ADDON_PACKAGE,
      'package',
      'credentialsMeta',
      Object.fromEntries(
        declaredCredentials.map((name) => [
          name,
          { name, displayName: name, type: 'singleton' },
        ])
      )
    )
  }
}

const servicesHandedToAddon = async (namespace: string) =>
  (await getOrCreatePackageSingletonServices(
    ADDON_PACKAGE,
    createParentServices(),
    pikkuState(null, 'addons', 'packages').get(namespace) as never
  )) as any

const secretsHandedToAddon = async (namespace: string) =>
  (await servicesHandedToAddon(namespace)).secretsSeenByAddon as SecretService

const credentialsHandedToAddon = async (namespace: string) =>
  (await servicesHandedToAddon(namespace))
    .credentialsSeenByAddon as CredentialService

describe('addon secrets are scoped to what the addon declared', () => {
  beforeEach(() => {
    resetPikkuState()
  })

  test('a declared secret is readable', async () => {
    registerAddon(['ADDON_KEY'])
    wireAddon({
      name: 'example',
      package: ADDON_PACKAGE,
    })

    const secrets = await secretsHandedToAddon('example')
    assert.equal(await secrets.getSecret('ADDON_KEY'), 'value-of-ADDON_KEY')
  })

  test('an undeclared secret is denied', async () => {
    registerAddon(['ADDON_KEY'])
    wireAddon({
      name: 'example',
      package: ADDON_PACKAGE,
    })

    const secrets = await secretsHandedToAddon('example')
    await assert.rejects(
      () => secrets.getSecret('SOMEONE_ELSES_KEY'),
      /denied/i
    )
  })

  test('a scoped addon cannot write secrets', async () => {
    registerAddon(['ADDON_KEY'])
    wireAddon({
      name: 'example',
      package: ADDON_PACKAGE,
    })

    const secrets = await secretsHandedToAddon('example')
    await assert.rejects(() => secrets.setSecret('ADDON_KEY', 'x'))
  })

  test('an addon that declares nothing is scoped to nothing', async () => {
    registerAddon([])
    wireAddon({
      name: 'example',
      package: ADDON_PACKAGE,
    })

    const secrets = await secretsHandedToAddon('example')
    await assert.rejects(() => secrets.getSecret('ADDON_KEY'), /denied/i)
  })

  test('globalSecrets, set by the host, hands over the whole service', async () => {
    registerAddon(['ADDON_KEY'])
    wireAddon({
      name: 'example',
      package: ADDON_PACKAGE,
      globalSecrets: 'administers secrets named by the operator at runtime',
    })

    const secrets = await secretsHandedToAddon('example')
    assert.equal(
      await secrets.getSecret('SOMEONE_ELSES_KEY'),
      'value-of-SOMEONE_ELSES_KEY'
    )
    await assert.doesNotReject(() => secrets.setSecret('ADDON_KEY', 'x'))
  })

  test('an addon with no singleton factory is still scoped', async () => {
    pikkuState(ADDON_PACKAGE, 'package', 'declaredSecrets', ['ADDON_KEY'])
    wireAddon({
      name: 'example',
      package: ADDON_PACKAGE,
    })

    const services = await getOrCreatePackageSingletonServices(
      ADDON_PACKAGE,
      createParentServices(),
      pikkuState(null, 'addons', 'packages').get('example') as never
    )

    assert.equal(
      await services.secrets.getSecret('ADDON_KEY'),
      'value-of-ADDON_KEY'
    )
    await assert.rejects(
      () => services.secrets.getSecret('SOMEONE_ELSES_KEY'),
      /denied/i
    )
  })

  test('scoping applies to the key the addon asks for, not the aliased one', async () => {
    registerAddon(['ADDON_KEY'])
    wireAddon({
      name: 'example',
      package: ADDON_PACKAGE,
      secretOverrides: { ADDON_KEY: 'PROD_ADDON_KEY' },
    })

    const secrets = await secretsHandedToAddon('example')
    assert.equal(
      await secrets.getSecret('ADDON_KEY'),
      'value-of-PROD_ADDON_KEY'
    )
    await assert.rejects(() => secrets.getSecret('PROD_ADDON_KEY'), /denied/i)
  })
})

describe('addon credentials are scoped to what the addon declared', () => {
  beforeEach(() => {
    resetPikkuState()
  })

  test('a declared credential is reachable', async () => {
    registerAddon(['ADDON_KEY'], ['slack'])
    wireAddon({ name: 'example', package: ADDON_PACKAGE })

    const credentials = await credentialsHandedToAddon('example')
    assert.equal(await credentials.get('slack'), 'credential-of-slack')
  })

  test('an undeclared credential is denied', async () => {
    registerAddon(['ADDON_KEY'], ['slack'])
    wireAddon({ name: 'example', package: ADDON_PACKAGE })

    const credentials = await credentialsHandedToAddon('example')
    await assert.rejects(() => credentials.get('stripe'), /denied/i)
  })

  test('a scoped addon cannot enumerate the app users', async () => {
    registerAddon(['ADDON_KEY'], ['slack'])
    wireAddon({ name: 'example', package: ADDON_PACKAGE })

    const credentials = await credentialsHandedToAddon('example')
    await assert.rejects(() => credentials.getAllUsers(), /denied/i)
  })

  test('an addon with no singleton factory is still scoped', async () => {
    pikkuState(ADDON_PACKAGE, 'package', 'credentialsMeta', {
      slack: { name: 'slack', displayName: 'slack', type: 'singleton' },
    } as never)
    wireAddon({ name: 'example', package: ADDON_PACKAGE })

    const services = await getOrCreatePackageSingletonServices(
      ADDON_PACKAGE,
      createParentServices(),
      pikkuState(null, 'addons', 'packages').get('example') as never
    )
    const credentials = services.credentialService as CredentialService

    assert.equal(await credentials.get('slack'), 'credential-of-slack')
    await assert.rejects(() => credentials.get('stripe'), /denied/i)
    await assert.rejects(() => credentials.getAllUsers(), /denied/i)
  })

  test('globalCredentials, set by the host, hands over the whole service', async () => {
    registerAddon(['ADDON_KEY'], ['slack'])
    wireAddon({
      name: 'example',
      package: ADDON_PACKAGE,
      globalCredentials: 'links credentials an operator names at runtime',
    })

    const credentials = await credentialsHandedToAddon('example')
    assert.equal(await credentials.get('stripe'), 'credential-of-stripe')
    assert.deepEqual(await credentials.getAllUsers(), ['user-1'])
  })
})
