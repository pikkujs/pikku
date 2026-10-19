// Checks what `pikku all` generated for the scenario projects, then drives the
// shared resolver and serializer for the `deploy` target, which no adapter uses
// yet (so there is no `pikku` command to run it through).
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const verifier = resolve(here, '..')
const cliDist = resolve(verifier, '../../packages/cli/dist/src/contributors')
const { resolveTargetContributors } = await import(
  pathToFileURL(join(cliDist, 'resolve-contributors.js')).href
)
const { serializeContributors } = await import(
  pathToFileURL(join(cliDist, 'serialize-contributors.js')).href
)

const generated = (scenario: string) =>
  join(
    verifier,
    'scenarios',
    scenario,
    '.pikku/contributors/pikku-dev-contributors.gen.ts'
  )
const read = (file: string) => readFileSync(file, 'utf8')

// --- every addon wrote its manifest, relative to its package, posix --------
for (const addon of ['contrib-notify', 'contrib-select', 'contrib-bad']) {
  const meta = JSON.parse(
    read(
      join(
        verifier,
        addon,
        '.pikku/addon/contributors/pikku-contributors-meta.gen.json'
      )
    )
  )
  for (const [name, variants] of Object.entries<any>(meta.contributors)) {
    for (const ref of Object.values<any>(variants)) {
      assert.match(
        ref.module,
        /^src\/[\w-]+\.ts$/,
        `${addon}/${name}: module must be relative to the package root`
      )
    }
  }
}
const notifyMeta = JSON.parse(
  read(
    join(
      verifier,
      'contrib-notify/.pikku/addon/contributors/pikku-contributors-meta.gen.json'
    )
  )
)
assert.deepEqual(notifyMeta.contributors.notifier, {
  dev: { module: 'src/notifier.ts', export: 'notifierDev' },
  deploy: { module: 'src/notifier.ts', export: 'notifierDeploy' },
})
assert.deepEqual(Object.keys(notifyMeta.contributors.unused), ['dev'])

// --- dev: several addons, opt-in, ordering, selection ----------------------
const devFile = generated('multi')
const dev = read(devFile)
const imported = [
  ...dev.matchAll(/^import \{ (\w+) as contributor\d+ \} from "([^"]+)"/gm),
].map((m) => m[1])
assert.deepEqual(
  imported.sort(),
  [
    'blobDev',
    'cacheDev',
    'loggerPrefixDev',
    'notifierAuditDev',
    'notifierDev',
    'queueNoopDev',
  ],
  'only the selected dev variants are imported'
)
for (const absent of [
  'unused',
  'Deploy',
  'store-postgres',
  'store-sqlite',
  'queue-real',
]) {
  assert.ok(
    !dev.includes(absent),
    `'${absent}' must not appear in the dev file`
  )
}
const at = (needle: string) => dev.indexOf(needle)
assert.ok(
  at('// notifier\n') < at('// notifier-audit'),
  'notifier-audit needs notifier, so it runs after it despite being registered first'
)
assert.equal(
  dev.split('const platform: any = ').length,
  2,
  'platform is inlined once'
)

const { createPlatformServices, serverStartHooks, serverStopHooks } =
  await import(pathToFileURL(devFile).href)
const logger = { name: 'runtime-logger' }
const services = await createPlatformServices(
  { NOTIFY_CHANNEL: 'ops' },
  { logger }
)
assert.equal(services.notifier.channel, 'ops')
assert.equal(services.notifier.label, 'dev')
assert.equal(
  services.notifier.audited,
  'dev',
  'the empty-provides decorator ran'
)
assert.equal(services.notifier.needsQueue, false, 'run received the platform')
assert.deepEqual(
  services.logger,
  { prefix: 'dev', inner: logger },
  'a baseline service is replaced'
)
assert.equal(services.queueClient.kind, 'noop')
assert.equal(services.store, undefined, 'no database, so no store contributor')
assert.strictEqual(
  services.blob.readCache(),
  services.cache,
  'blob ran before cache and still sees it: run got the live bag'
)
assert.deepEqual(
  serverStartHooks.map((h: any) => h.name),
  ['blob', 'cache']
)
assert.deepEqual(
  serverStopHooks.map((h: any) => h.name),
  ['cache', 'blob'],
  'stop hooks run in reverse'
)
for (const hook of serverStartHooks) await hook.run(services)
for (const hook of serverStopHooks) await hook.run(services)
assert.deepEqual(services.events, [
  'start:blob',
  'start:cache',
  'stop:cache',
  'stop:blob',
])
assert.deepEqual(
  (await createPlatformServices({}, { logger })).notifier.channel,
  'default'
)

// --- the database engine picks the store, from the same facts -------------
for (const [scenario, engine, imp] of [
  ['pg', 'postgres', 'storePostgresDev'],
  ['sqlite', 'sqlite', 'storeSqliteDev'],
] as const) {
  const source = read(generated(scenario))
  assert.match(
    source,
    new RegExp(`\\b${imp} as`),
    `${scenario}: ${imp} selected`
  )
  assert.ok(
    !/store(Postgres|Sqlite)Dev/.test(source.replace(imp, '')),
    `${scenario}: the other engine's store is not imported`
  )
  assert.match(source, new RegExp(`"db":\\{"engine":"${engine}"`))
  const mod = await import(pathToFileURL(generated(scenario)).href)
  const built = await mod.createPlatformServices({}, {})
  assert.equal(built.store.engine, engine)
}

// --- deploy: same resolver and serializer, the other variants --------------
const scenarioDir = join(verifier, 'scenarios/multi')
const optedIn = (addon: string, names: string[]) => {
  const meta = JSON.parse(
    read(
      join(
        verifier,
        addon,
        '.pikku/addon/contributors/pikku-contributors-meta.gen.json'
      )
    )
  )
  return Object.fromEntries(names.map((n) => [n, meta.contributors[n]]))
}
const state = {
  optedInContributors: {
    notify: {
      packageName: '@verifier/contrib-notify',
      contributors: optedIn('contrib-notify', [
        'notifier-audit',
        'notifier',
        'logger-prefix',
        'blob',
        'cache',
        'unused',
      ]),
    },
    select: {
      packageName: '@verifier/contrib-select',
      contributors: optedIn('contrib-select', [
        'store-postgres',
        'store-sqlite',
        'queue-real',
        'queue-noop',
      ]),
    },
  },
  rpc: {
    wireAddonDeclarations: new Map([
      ['notify', { file: join(scenarioDir, 'src/addons.ts') }],
      ['select', { file: join(scenarioDir, 'src/addons.ts') }],
    ]),
  },
}
const basePlatform = {
  serviceNames: ['queueService'],
  needsQueue: true,
  needsWorkflow: false,
  needsAgent: false,
  runtimeServices: ['logger', 'variables', 'secrets', 'schema'],
}
const platform = {
  ...basePlatform,
  db: { engine: 'postgres' as const, coercionMap: { users: { id: 'int' } } },
}
const resolved = await resolveTargetContributors({
  state,
  rootDir: scenarioDir,
  target: 'deploy',
  platform,
})
assert.deepEqual(
  resolved.ordered.map((c: any) => c.name).sort(),
  [
    'blob',
    'cache',
    'logger-prefix',
    'notifier',
    'notifier-audit',
    'queue-real',
    'store-postgres',
  ],
  'deploy selects by the same platform facts'
)
assert.deepEqual(
  resolved.withoutVariant,
  ['unused'],
  'unused has no deploy variant'
)
const deploySource = serializeContributors({
  contributors: resolved.ordered,
  platform,
  specifier: (c: any) => pathToFileURL(c.module).href,
})
assert.ok(
  !/Dev\b/.test(deploySource.replace(/\/\/.*$/gm, '')),
  'no dev variant in the deploy file'
)
assert.ok(
  !deploySource.includes('queue-noop') && !deploySource.includes('store-sqlite')
)
assert.ok(!deploySource.includes('unused.ts'))
const deployFile = join(scenarioDir, '.pikku/contributors/check-deploy.gen.ts')
writeFileSync(deployFile, deploySource)
const deployed = await import(pathToFileURL(deployFile).href)
const built = await deployed.createPlatformServices({}, { logger })
assert.equal(built.store.target, 'deploy')
assert.deepEqual(
  built.store.coercionTables,
  ['users'],
  'the coercion map reaches run'
)
assert.equal(built.queueClient.kind, 'real')
assert.equal(built.notifier.audited, 'deploy')
assert.equal(built.notifier.serviceCount, 1)

// A widened platform is passed through to `when`.
const widened = await resolveTargetContributors({
  state,
  rootDir: scenarioDir,
  target: 'deploy',
  platform: { ...basePlatform, needsQueue: false },
})
assert.ok(widened.ordered.some((c: any) => c.name === 'queue-noop'))
assert.ok(!widened.ordered.some((c: any) => c.name === 'queue-real'))

console.log('contributors: all checks passed')
