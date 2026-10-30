// Checks what `pikku all` generated for the scenario projects, then drives the
// deploy target through the real adapters: the shared per-unit writer asks the
// standalone and Cloudflare adapters what their runtime supports, resolves,
// writes the file their entries import, and the entries are generated here.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const verifier = resolve(here, '..')
const cliDist = resolve(verifier, '../../packages/cli/dist/src/contributors')
const { resolveTargetContributors } = await import(
  pathToFileURL(join(cliDist, 'resolve-contributors.js')).href
)
const { writeUnitPlatformServices } = await import(
  pathToFileURL(resolve(cliDist, '../deploy/platform-services.js')).href
)
const { StandaloneProviderAdapter } = await import('@pikku/deploy-standalone')
const { CloudflareProviderAdapter } = await import('@pikku/deploy-cloudflare')
const { build } = await import('esbuild')

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

// --- deploy: the real adapters, the shared per-unit writer ----------------
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
const stateOf = (notify: string[], select: string[]) => ({
  optedInContributors: {
    notify: {
      packageName: '@verifier/contrib-notify',
      contributors: optedIn('contrib-notify', notify),
    },
    select: {
      packageName: '@verifier/contrib-select',
      contributors: optedIn('contrib-select', select),
    },
  },
  rpc: {
    wireAddonDeclarations: new Map([
      ['notify', { file: join(scenarioDir, 'src/addons.ts') }],
      ['select', { file: join(scenarioDir, 'src/addons.ts') }],
    ]),
  },
})
const state = stateOf(
  ['notifier-audit', 'notifier', 'logger-prefix', 'blob', 'cache', 'unused'],
  ['store-postgres', 'store-sqlite', 'queue-real', 'queue-noop']
)
const basePlatform = {
  serviceNames: ['queueService'],
  needsQueue: true,
  needsWorkflow: false,
  needsAgent: false,
}
const platform = {
  ...basePlatform,
  db: { engine: 'postgres' as const, coercionMap: { users: { id: 'int' } } },
}
const deployRoot = join(scenarioDir, '.pikku/deploy-check')
rmSync(deployRoot, { recursive: true, force: true })
const unitCtx = (
  provider: string,
  name: string,
  target: string,
  extra = {}
) => {
  const unitDir = join(deployRoot, provider, name)
  mkdirSync(unitDir, { recursive: true })
  return {
    unit: {
      name,
      role: 'function',
      target,
      functionIds: [],
      services: [{ capability: 'queue', sourceServiceName: 'queueService' }],
      handlers: [],
      dependsOn: [],
      tags: [],
    },
    unitDir,
    bootstrapPath: './.pikku/pikku-bootstrap.gen.js',
    configImport: '',
    configVar: 'createConfig',
    servicesImport: '',
    servicesVar: 'createSingletonServices',
    singletonServicesImport: '',
    servicesType: 'Record<string, any>',
    mcpImport: '',
    mcpServerOption: '',
    contributorPlatform: platform,
    db: { engine: 'postgres' },
    ...extra,
  } as any
}
const generate = (provider: any, ctx: any, st: any) =>
  writeUnitPlatformServices({
    provider,
    ctx,
    state: st,
    projectDir: scenarioDir,
  })

const standalone = new StandaloneProviderAdapter({})
const standaloneCtx = unitCtx('standalone', 'api', 'server')
const written = await generate(standalone, standaloneCtx, state)
assert.equal(written?.importPath, './platform-services.gen.js')
const standaloneFile = join(standaloneCtx.unitDir, 'platform-services.gen.ts')
const deploySource = read(standaloneFile)
assert.deepEqual(
  [...deploySource.matchAll(/^import \{ (\w+) as contributor\d+ \}/gm)]
    .map((m) => m[1])
    .sort(),
  [
    'blobDeploy',
    'cacheDeploy',
    'loggerPrefixDeploy',
    'notifierAuditDeploy',
    'notifierDeploy',
    'queueRealDeploy',
    'storePostgresDeploy',
  ],
  'deploy selects by the same platform facts'
)
assert.ok(
  !/Dev\b/.test(deploySource.replace(/\/\/.*$/gm, '')),
  'no dev variant in the deploy file'
)
assert.ok(
  !deploySource.includes('queue-noop') && !deploySource.includes('unused')
)
const deployed = await import(pathToFileURL(standaloneFile).href)
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

// The standalone entry imports exactly that file and spreads what it returns.
const standaloneEntry = standalone.generateEntrySource({
  ...standaloneCtx,
  platformServices: written,
})
assert.match(
  standaloneEntry,
  /import \{ createPlatformServices \} from '\.\/platform-services\.gen\.js'/
)
assert.match(standaloneEntry, /\.\.\.platformServices,/)

// The platform is widened with the unit: a host contributor reads it in `when`
// and `run`, and `pikku dev`, which has no unit, leaves it out.
const tagState = stateOf(['unit-tag'], [])
const tagged = await generate(
  standalone,
  unitCtx('standalone', 'tagged', 'server'),
  tagState
)
assert.ok(tagged, 'unit-tag is selected on a deploy, where the unit exists')
const taggedFile = join(
  deployRoot,
  'standalone/tagged/platform-services.gen.ts'
)
assert.equal(
  (
    await (
      await import(pathToFileURL(taggedFile).href)
    ).createPlatformServices({}, {})
  ).unitTag,
  'tagged'
)

// An opted-in contributor whose `requires` the target cannot supply is a build
// error naming it, not a silent omission.
await assert.rejects(
  generate(
    standalone,
    unitCtx('standalone', 'edge', 'server'),
    stateOf([], ['edge-queue'])
  ),
  (error: Error) =>
    /The standalone deploy cannot supply what a contributor/.test(
      error.message
    ) &&
    /'edge-queue' of addon 'select'.*requires cloudflare/.test(error.message)
)
// ... while one with no deploy variant at all is just not part of the target.
const devOnly = await generate(
  standalone,
  unitCtx('standalone', 'devonly', 'server'),
  stateOf(['unused'], [])
)
assert.equal(devOnly, undefined)

// Cloudflare: a Worker supplies cloudflare bindings, and the adapter itself
// selects column coercion beside what the project opted in to.
const cloudflare = new CloudflareProviderAdapter({})
const workerCtx = unitCtx('cloudflare', 'edge', 'serverless', { db: undefined })
const workerState = stateOf(['unit-tag'], ['edge-queue', 'kysely-fake'])
const worker = await generate(cloudflare, workerCtx, workerState)
const workerFile = join(workerCtx.unitDir, 'platform-services.gen.ts')
const workerSource = read(workerFile)
assert.match(workerSource, /edgeQueueDeploy/)
assert.match(
  workerSource,
  /kysely-coercion|coercionContributor/,
  'the adapter selects coercion itself'
)
const workerServices = await (
  await import(pathToFileURL(workerFile).href)
).createPlatformServices({ QUEUE: 'queue-binding' }, {})
assert.equal(workerServices.edgeQueue, 'queue-binding')
assert.equal(
  workerServices.kysely.plugins.length,
  1,
  'coercion decorated the platform kysely'
)
assert.equal(workerServices.unitTag, 'edge')
const workerEntry = cloudflare.generateEntrySource({
  ...workerCtx,
  platformServices: worker,
})
assert.match(workerEntry, /__pikkuContributorServices\(env, services\)/)

// The same project on the container (node, env only) cannot take the binding.
await assert.rejects(
  generate(
    cloudflare,
    unitCtx('cloudflare', 'box', 'server'),
    stateOf([], ['edge-queue'])
  ),
  /The cloudflare deploy cannot supply what a contributor.*'edge-queue'.*requires cloudflare/s
)

// A Worker never runs the server lifecycle, so a contributor with
// `onServerStart` bundled into one is a build error naming contributor and
// unit; the same contributor on a container (server target) unit works, and
// `onServerStop` alone only warns.
await assert.rejects(
  generate(
    cloudflare,
    unitCtx('cloudflare', 'edge-hooks', 'serverless', { db: undefined }),
    stateOf(['blob'], [])
  ),
  (error: Error) =>
    /contributor 'blob' in unit 'edge-hooks'/.test(error.message) &&
    /onServerStart would never be called/.test(error.message)
)
const containerCtx = unitCtx('cloudflare', 'box-hooks', 'server')
const container = await generate(
  cloudflare,
  containerCtx,
  stateOf(['blob'], [])
)
assert.ok(container, 'the container unit takes the onServerStart contributor')
const containerEntry = cloudflare.generateServerEntrySource({
  ...containerCtx,
  lifecycle: { importPath: './lifecycle.js', variable: 'lifecycle' },
  platformServices: container,
})
assert.match(containerEntry, /composeServerLifecycle\(__pikkuLifecycle,/)
assert.match(containerEntry, /__pikkuServerLifecycle\?\.beforeStart/)
const stopWarnings: string[] = []
const stopOnlyCtx = unitCtx('cloudflare', 'edge-stop', 'serverless', {
  db: undefined,
})
const stopOnly = await writeUnitPlatformServices({
  provider: cloudflare,
  ctx: stopOnlyCtx,
  state: stateOf(['hook-stop-only'], []),
  projectDir: scenarioDir,
  warn: (message: string) => stopWarnings.push(message),
})
assert.ok(stopOnly, 'onServerStop alone does not fail the Worker build')
assert.equal(stopWarnings.length, 1)
assert.match(stopWarnings[0]!, /'hook-stop-only'.*onServerStop.*'edge-stop'/)
// A Worker with no hooks at all warns about nothing.
stopWarnings.length = 0
await writeUnitPlatformServices({
  provider: cloudflare,
  ctx: workerCtx,
  state: workerState,
  projectDir: scenarioDir,
  warn: (message: string) => stopWarnings.push(message),
})
assert.deepEqual(stopWarnings, [])

// The standalone target runs the server lifecycle, so it takes the hooks and
// its entry composes them around the app's.
const hooked = await generate(
  standalone,
  unitCtx('standalone', 'hooked', 'server'),
  stateOf(['hook-c', 'hook-b', 'hook-a'], [])
)
assert.ok(hooked)
const hookedSource = read(
  join(deployRoot, 'standalone/hooked/platform-services.gen.ts')
)
assert.deepEqual(
  [
    ...hookedSource.matchAll(
      /\{ name: "(hook-\w)", run: \(services\) => contributor\d+\.onServerStart/g
    ),
  ].map((m) => m[1]),
  ['hook-a', 'hook-b', 'hook-c']
)
assert.deepEqual(
  [
    ...hookedSource.matchAll(
      /\{ name: "(hook-\w)", run: \(services\) => contributor\d+\.onServerStop/g
    ),
  ].map((m) => m[1]),
  ['hook-c', 'hook-b', 'hook-a'],
  'stop hooks are listed in reverse run order'
)

// The Worker bundle (esbuild, browser platform) keeps working and carries only
// the selected contributors.
const bundled = await build({
  entryPoints: [workerFile],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'esm',
  logLevel: 'silent',
  external: ['@pikku/kysely', 'kysely'],
})
const bundle = bundled.outputFiles[0]!.text
assert.ok(bundle.includes('edgeQueue'))
assert.ok(
  !bundle.includes('queueClient'),
  'an unselected contributor is not bundled'
)

// Opting in to nothing writes no file and clears a stale one.
const none = await generate(standalone, standaloneCtx, stateOf([], []))
assert.equal(none, undefined)
assert.equal(existsSync(standaloneFile), false)

console.log('contributors: all checks passed')
