import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, afterEach } from 'node:test'
import {
  addDependency,
  exposedFunctions,
  installAddonIntoApp,
  wireAuth,
  type AddonInstall,
} from './install-addon.js'

const created: string[] = []
afterEach(async () => {
  for (const dir of created.splice(0)) await rm(dir, { recursive: true, force: true })
})

const AUTH_TS = `import { betterAuth } from 'better-auth'
import { pikkuActor, pikkuBan } from '@pikku/better-auth'
import { pikkuBetterAuth } from '#pikku/auth'

export const auth = pikkuBetterAuth(
  async ({ kysely, secrets, variables, logger }) => {
    return betterAuth({
      plugins: [
        pikkuActor({
          secret: 'x',
        }),
        pikkuBan(),
      ],
    })
  },
)
`

const install = (overrides: Partial<AddonInstall> = {}): AddonInstall => ({
  projectRoot: '/app',
  srcDir: '/app/packages/functions/src',
  name: 'dolibarr',
  camelName: 'dolibarr',
  pascalName: 'Dolibarr',
  screamingName: 'DOLIBARR',
  packageName: '@pikku/addon-dolibarr',
  depProtocol: 'workspace:*',
  mode: 'delegated',
  functions: {
    usersRetrieveInfo: 'return dolibarr.call("GET", "/users/info", data) as any',
    usersCreate: 'return dolibarr.call("POST", "/users", data) as any',
  },
  baseUrl: 'https://erp.example.com/api/index.php',
  ...overrides,
})

describe('exposedFunctions', () => {
  test('per-user modes expose every function', () => {
    assert.deepEqual(exposedFunctions(install({ mode: 'connect' })), [
      'usersCreate',
      'usersRetrieveInfo',
    ])
  })

  test('a shared secret exposes only reads', () => {
    assert.deepEqual(exposedFunctions(install({ mode: 'shared' })), [
      'usersRetrieveInfo',
    ])
  })
})

describe('wireAuth', () => {
  test('delegated mode adds pikkuDelegatedAuth that stores the upstream credential', () => {
    const { source } = wireAuth(AUTH_TS, install())
    assert.match(source, /import \{ pikkuActor, pikkuBan, pikkuDelegatedAuth \} from '@pikku\/better-auth'/)
    assert.match(source, /import \{ authenticateDolibarrUpstream \} from '@pikku\/addon-dolibarr'/)
    assert.match(source, /async \(\{ kysely, secrets, variables, logger, credentialService, scopeService \}\)/)
    assert.match(source, /variables\.get\('DOLIBARR_BASE_URL'\)\) \?\? "https:\/\/erp\.example\.com\/api\/index\.php"/)
    assert.match(source, /credentialService\.set\('dolibarr', identity\.credential, userId\)/)
    assert.ok(source.indexOf('pikkuDelegatedAuth({') < source.indexOf('pikkuActor({'))
  })

  test('scenario actors carry the upstream credential', () => {
    const { source } = wireAuth(AUTH_TS, install({ mode: 'connect' }))
    assert.match(source, /pikkuActor\(\{\s+credentials: \{\s+names: \['dolibarr'\]/)
    assert.ok(!source.includes('pikkuDelegatedAuth'))
  })

  test('running twice changes nothing more', () => {
    const once = wireAuth(AUTH_TS, install()).source
    assert.equal(wireAuth(once, install()).source, once)
  })

  test('shared and none leave auth.ts alone', () => {
    assert.equal(wireAuth(AUTH_TS, install({ mode: 'shared' })).source, AUTH_TS)
    assert.equal(wireAuth(AUTH_TS, install({ mode: 'none' })).source, AUTH_TS)
  })
})

describe('installAddonIntoApp', () => {
  test('adds the dependency, the wireAddon file, the auth wiring and the base URL', async () => {
    const root = await mkdtemp(join(tmpdir(), 'install-addon-'))
    created.push(root)
    const srcDir = join(root, 'packages', 'functions', 'src')
    await mkdir(join(srcDir, 'addons'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'root', dependencies: { zod: '^4' } }))
    await writeFile(join(root, 'packages', 'functions', 'package.json'), JSON.stringify({ name: 'fns' }))
    await writeFile(join(srcDir, 'auth.ts'), AUTH_TS)

    const { written } = installAddonIntoApp(install({ projectRoot: root, srcDir }))
    assert.deepEqual(written.sort(), [
      '.env',
      'package.json',
      'packages/functions/package.json',
      'packages/functions/src/addons/dolibarr.addon.ts',
      'packages/functions/src/auth.ts',
    ])
    const rootPkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    assert.deepEqual(Object.keys(rootPkg.dependencies), ['@pikku/addon-dolibarr', 'zod'])
    const wire = await readFile(join(srcDir, 'addons', 'dolibarr.addon.ts'), 'utf8')
    assert.match(wire, /auth: true/)
    assert.match(wire, /'usersRetrieveInfo'/)
    assert.equal(
      await readFile(join(root, '.env'), 'utf8'),
      'DOLIBARR_BASE_URL=https://erp.example.com/api/index.php\n'
    )
  })

  test('an existing dependency is left as it is', async () => {
    const root = await mkdtemp(join(tmpdir(), 'install-addon-'))
    created.push(root)
    const path = join(root, 'package.json')
    await writeFile(path, JSON.stringify({ dependencies: { '@pikku/addon-x': '1.0.0' } }))
    assert.equal(addDependency(path, '@pikku/addon-x', 'workspace:*'), false)
  })
})
