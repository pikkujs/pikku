import { afterEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ErrorCode } from '@pikku/inspector/lite'
import {
  addonDependencyDeclarations,
  addonDependencySdkSpecs,
  checkAddonDependencyVersions,
  checkWorkspaceDependencySdks,
  resolveAddonDependencies,
  withAddonDependencies,
} from './addon-dependencies.js'
import {
  RemoteAddonSyncError,
  mergeSdkSpecs,
  runAddonSync,
} from './remote-addon-sync.js'
import { addonGeneratedImport } from './remote-addon-import.js'
import { serializeTypedRPCMap } from '../functions/wirings/rpc/serialize-typed-rpc-map.js'

const STRIPE = '@acme/addon-stripe'
const CRM = '@acme/addon-crm'

const roots: string[] = []
const tempDir = (prefix: string) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  roots.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
}

/**
 * A workspace: `billing` is the addon being built, and declares stripe and
 * crm. stripe is a package beside it, linked into billing's node_modules the
 * way a workspace dependency is; crm is not installed, so it comes from the
 * registry.
 */
const makeWorkspace = ({
  stripeSdkVersion = '1.2.0' as string | null,
  uses = {
    stripe: `${STRIPE}@^1.0.0`,
    crm: `${CRM}@^3.1.0`,
  } as Record<string, string>,
} = {}) => {
  const root = tempDir('pikku-addon-deps-')
  const billing = join(root, 'billing')
  const stripe = join(root, 'stripe')
  writeJson(join(billing, 'package.json'), {
    name: '@acme/addon-billing',
    version: '1.0.0',
    pikku: { uses },
  })
  writeJson(join(stripe, 'package.json'), { name: STRIPE, version: '1.2.0' })
  writeJson(join(stripe, 'pikku.config.json'), { outDir: './.pikku' })
  if (stripeSdkVersion) {
    writeJson(join(stripe, '.pikku', 'sdk', 'manifest.json'), {
      name: STRIPE,
      version: stripeSdkVersion,
    })
  }
  mkdirSync(join(billing, 'node_modules', '@acme'), { recursive: true })
  symlinkSync(stripe, join(billing, 'node_modules', STRIPE), 'dir')
  return { root, billing, stripe }
}

describe('resolveAddonDependencies', () => {
  test('a package linked from the workspace is read from the SDK it generated; anything else from the registry', () => {
    const { billing, stripe } = makeWorkspace()
    const dependencies = resolveAddonDependencies(billing)
    assert.deepEqual(dependencies, [
      {
        alias: 'stripe',
        package: STRIPE,
        range: '^1.0.0',
        source: 'workspace',
        packageDir: stripe,
        sdkDir: join(stripe, '.pikku', 'sdk'),
      },
      { alias: 'crm', package: CRM, range: '^3.1.0', source: 'registry' },
    ])
    assert.deepEqual(addonDependencySdkSpecs(dependencies), [
      { name: CRM, range: '^3.1.0', at: 'package.json pikku.uses.crm' },
    ])
  })

  test('a package installed into node_modules from a registry is not a workspace package', () => {
    const { billing } = makeWorkspace({ uses: { crm: `${CRM}@^3.1.0` } })
    writeJson(join(billing, 'node_modules', CRM, 'package.json'), {
      name: CRM,
      version: '3.1.0',
    })
    assert.equal(resolveAddonDependencies(billing)[0]!.source, 'registry')
  })

  test('the older list form names no range, so there is nothing to sync', () => {
    const root = tempDir('pikku-addon-deps-list-')
    writeJson(join(root, 'package.json'), { pikku: { uses: ['kysely'] } })
    assert.deepEqual(resolveAddonDependencies(root), [])
  })
})

describe('checkWorkspaceDependencySdks', () => {
  test('passes an SDK whose version the range accepts', () => {
    const { billing } = makeWorkspace()
    assert.deepEqual(
      checkWorkspaceDependencySdks(resolveAddonDependencies(billing)),
      []
    )
  })

  test('PKU354 when the workspace copy is a version the range does not accept', () => {
    const { billing } = makeWorkspace({ stripeSdkVersion: '2.0.0' })
    const problems = checkWorkspaceDependencySdks(
      resolveAddonDependencies(billing)
    )
    assert.deepEqual(
      problems.map((p) => p.code),
      [ErrorCode.ADDON_DEPENDENCY_VERSION_MISMATCH]
    )
    assert.match(problems[0]!.message, /\^1\.0\.0.*2\.0\.0/)
  })

  test('PKU338 when the workspace package has not generated its SDK yet', () => {
    const { billing, stripe } = makeWorkspace({ stripeSdkVersion: null })
    const problems = checkWorkspaceDependencySdks(
      resolveAddonDependencies(billing)
    )
    assert.deepEqual(
      problems.map((p) => p.code),
      [ErrorCode.REMOTE_ADDON_NOT_DEV_DEPENDENCY]
    )
    assert.ok(problems[0]!.message.includes(`Run 'pikku all' in ${stripe}`))
  })
})

describe('typed maps in an addon', () => {
  test('a workspace dependency is imported from its SDK, under its alias', () => {
    const { billing, stripe } = makeWorkspace()
    const declarations = addonDependencyDeclarations(billing)
    assert.deepEqual([...declarations.keys()], ['stripe'])

    const mapFile = join(
      billing,
      '.pikku',
      'addon',
      'rpc',
      'pikku-rpc-wirings-map.internal.gen.d.ts'
    )
    assert.equal(
      addonGeneratedImport(
        declarations.get('stripe')!,
        'rpc/pikku-rpc-wirings-map.remote.gen.js',
        mapFile,
        billing
      ),
      '../../../../stripe/.pikku/sdk/rpc/pikku-rpc-wirings-map.remote.gen.js'
    )

    const result = serializeTypedRPCMap(
      { warn() {}, info() {}, debug() {}, error() {} } as never,
      mapFile,
      {},
      {
        customTypes: new Map(),
        getTypeMeta: () => {
          throw new Error('type not found')
        },
      } as never,
      {},
      {},
      join(billing, '.pikku', 'addon', 'pikku-custom-types.gen.d.ts'),
      withAddonDependencies({ rootDir: billing, addon: {} }, new Map()),
      undefined,
      undefined,
      billing
    )
    assert.ok(
      result.includes(
        `import type { RPCMap as StripeRPCMap } from '../../../../stripe/.pikku/sdk/rpc/pikku-rpc-wirings-map.remote.gen.js'`
      )
    )
    assert.ok(result.includes(`PrefixKeys<StripeRPCMap, 'stripe'>`))
    assert.ok(
      result.includes(
        `import type { AgentMap as StripeAgentMap } from '../../../../stripe/.pikku/sdk/agent/pikku-agent-map.gen.d.js'`
      )
    )
    assert.ok(!stripe.includes('node_modules'))
  })

  test('only an addon merges its dependencies, and a wiring keeps its name over an alias', () => {
    const { billing } = makeWorkspace()
    const wired = new Map([['stripe', { package: '@other/stripe' }]])
    assert.equal(withAddonDependencies({ rootDir: billing }, wired), wired)
    assert.deepEqual(
      withAddonDependencies({ rootDir: billing, addon: {} }, wired)?.get(
        'stripe'
      ),
      { package: '@other/stripe' }
    )
  })

  test('a dependency whose SDK is missing is left out of the maps', () => {
    const { billing } = makeWorkspace({ stripeSdkVersion: null })
    assert.equal(addonDependencyDeclarations(billing).size, 0)
  })
})

describe('syncing an addon', () => {
  test('fetches its registry dependencies like a versioned wireRemoteAddon', async () => {
    const { billing } = makeWorkspace()
    mkdirSync(join(billing, 'src'))
    const asked: unknown[] = []
    await assert.rejects(
      runAddonSync({
        config: { rootDir: billing, srcDirectories: ['src'], addon: {} },
        logger: { debug() {}, info() {}, diagnostic() {} },
        resolveSdk: async (request) => {
          asked.push(request)
          throw new Error('offline')
        },
      }),
      /offline/
    )
    assert.deepEqual(asked, [{ name: CRM, range: '^3.1.0' }])
  })

  test('reports a workspace dependency at the wrong version', async () => {
    const { billing } = makeWorkspace({
      stripeSdkVersion: '2.0.0',
      uses: { stripe: `${STRIPE}@^1.0.0` },
    })
    mkdirSync(join(billing, 'src'))
    const diagnostics: { code: string }[] = []
    await runAddonSync({
      config: { rootDir: billing, srcDirectories: ['src'], addon: {} },
      logger: {
        debug() {},
        info() {},
        diagnostic: (d) => diagnostics.push(d),
      },
      resolveSdk: async () => {
        throw new Error('the registry is not asked for a workspace package')
      },
    })
    assert.deepEqual(
      diagnostics.map((d) => d.code),
      [ErrorCode.ADDON_DEPENDENCY_VERSION_MISMATCH]
    )
  })

  test('one package asked for at two ranges is refused (PKU353)', () => {
    assert.throws(
      () =>
        mergeSdkSpecs(
          [{ name: CRM, range: '^3.0.0', at: 'src/a.ts:1' }],
          [{ name: CRM, range: '^4.0.0', at: 'package.json pikku.uses.crm' }]
        ),
      (e: unknown) =>
        e instanceof RemoteAddonSyncError &&
        e.code === ErrorCode.REMOTE_ADDON_PACKAGE_INVALID
    )
    assert.equal(
      mergeSdkSpecs(
        [{ name: CRM, range: '^3.0.0', at: 'src/a.ts:1' }],
        [{ name: CRM, range: '^3.0.0', at: 'package.json pikku.uses.crm' }]
      ).length,
      1
    )
  })
})

describe('checkAddonDependencyVersions (the app wiring the addon)', () => {
  const billing = (uses: Record<string, string> = { stripe: 'payments' }) => ({
    package: '@acme/addon-billing',
    uses,
    dependencies: [{ alias: 'stripe', package: STRIPE, range: '^1.0.0' }],
  })

  const app = (stripeVersion: string) => {
    const root = tempDir('pikku-addon-deps-app-')
    writeJson(join(root, 'package.json'), { name: 'app' })
    writeJson(join(root, 'node_modules', STRIPE, 'package.json'), {
      name: STRIPE,
      version: stripeVersion,
    })
    return root
  }

  test('passes a local instance whose installed version the range accepts', () => {
    const root = app('1.4.0')
    assert.deepEqual(
      checkAddonDependencyVersions(
        root,
        new Map<string, any>([
          ['billing', billing()],
          ['payments', { package: STRIPE }],
        ])
      ),
      []
    )
  })

  test('PKU354 for a local instance at a version the range refuses', () => {
    const root = app('2.0.0')
    const problems = checkAddonDependencyVersions(
      root,
      new Map<string, any>([
        ['billing', billing()],
        ['payments', { package: STRIPE }],
      ])
    )
    assert.deepEqual(
      problems.map((p) => p.code),
      [ErrorCode.ADDON_DEPENDENCY_VERSION_MISMATCH]
    )
    assert.match(problems[0]!.message, /@acme\/addon-stripe@2\.0\.0/)
  })

  test('a versioned wireRemoteAddon is checked at the version the lock pins', () => {
    const root = app('9.9.9')
    writeJson(join(root, 'pikku-addons.lock'), {
      lockfileVersion: 1,
      sdks: {
        [STRIPE]: { range: '^1.0.0', version: '1.3.0', integrity: 'sha512-A' },
      },
    })
    const decls = (range: string) =>
      new Map<string, any>([
        ['billing', billing()],
        ['payments', { package: STRIPE, remote: true, range }],
      ])
    assert.deepEqual(checkAddonDependencyVersions(root, decls('^1.0.0')), [])
    writeJson(join(root, 'pikku-addons.lock'), {
      lockfileVersion: 1,
      sdks: {
        [STRIPE]: { range: '^2.0.0', version: '2.1.0', integrity: 'sha512-A' },
      },
    })
    assert.deepEqual(
      checkAddonDependencyVersions(root, decls('^2.0.0')).map((p) => p.code),
      [ErrorCode.ADDON_DEPENDENCY_VERSION_MISMATCH]
    )
  })

  test('a version that cannot be read fails closed', () => {
    const root = tempDir('pikku-addon-deps-none-')
    const problems = checkAddonDependencyVersions(
      root,
      new Map<string, any>([
        ['billing', billing()],
        ['payments', { package: STRIPE }],
      ])
    )
    assert.deepEqual(
      problems.map((p) => p.code),
      [ErrorCode.ADDON_DEPENDENCY_VERSION_MISMATCH]
    )
  })

  test('mappings the inspector already refuses are not reported twice', () => {
    const root = app('2.0.0')
    assert.deepEqual(
      checkAddonDependencyVersions(
        root,
        new Map<string, any>([
          ['billing', billing({})],
          ['payments', { package: STRIPE }],
        ])
      ),
      []
    )
    assert.deepEqual(
      checkAddonDependencyVersions(
        root,
        new Map<string, any>([
          ['billing', billing()],
          ['payments', { package: '@acme/addon-paypal' }],
        ])
      ),
      []
    )
  })
})
