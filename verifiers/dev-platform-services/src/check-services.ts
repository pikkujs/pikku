// Checks what `pikku all` generated for the scenario projects, then drives the
// deploy target through the real adapters: the shared per-unit writer asks the
// standalone and Cloudflare adapters what their runtime supports, resolves,
// writes the file their entries import, and the entries are generated here.
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createScriptContent,
  hasKey,
  ingestText,
  putText,
} from './script-content.js'

const here = dirname(fileURLToPath(import.meta.url))
const verifier = resolve(here, '..')
const cliDist = resolve(verifier, '../../packages/cli/dist/src')
const { writeUnitPlatformServices } = await import(
  pathToFileURL(resolve(cliDist, 'deploy/platform-services.js')).href
)
const { StandaloneProviderAdapter } = await import('@pikku/deploy-standalone')
const { CloudflareProviderAdapter } = await import('@pikku/deploy-cloudflare')
const { build } = await import('esbuild')

const generated = (scenario: string) =>
  join(
    verifier,
    'scenarios',
    scenario,
    '.pikku/services/pikku-dev-services.gen.ts'
  )
const store = createScriptContent(
  resolve(verifier, '.pikku-runtime/script-content')
)
const read = (file: string) => ingestText(store, file)
const importedNames = (source: string) =>
  [...source.matchAll(/^import \{ (\w+) as service\d+ \}/gm)]
    .map((m) => m[1]!)
    .sort()

// --- every addon wrote its manifest, relative to its package, posix --------
const metaOf = async (addon: string) =>
  JSON.parse(
    await read(
      join(
        verifier,
        addon,
        '.pikku/addon/services/pikku-services-meta.gen.json'
      )
    )
  )
const metas: Record<string, any> = {}
for (const addon of ['svc-notify', 'svc-select', 'svc-bad']) {
  metas[addon] = await metaOf(addon)
  for (const [name, service] of Object.entries<any>(metas[addon].services)) {
    assert.match(
      service.module,
      /^src\/[\w-]+\.ts$/,
      `${addon}/${name}: module must be relative to the package root`
    )
  }
}
assert.deepEqual(metas['svc-notify'].services.notifier, {
  module: 'src/notifier.ts',
  export: 'notifier',
  variants: {
    dev: { needs: ['logger'], provides: ['notifier'] },
    deploy: { needs: ['logger'], provides: ['notifier'] },
  },
})
assert.deepEqual(Object.keys(metas['svc-notify'].services.unused.variants), [
  'dev',
])
assert.deepEqual(metas['svc-notify'].services.blob, {
  module: 'src/blob.ts',
  export: 'blob',
  variants: {
    common: { needs: ['cache', 'events'], provides: ['blob'] },
  },
  onServerStart: true,
})
assert.deepEqual(
  metas['svc-select'].services.queueReal.variants.dev,
  { needs: ['queueService'], provides: ['queueClient'] },
  'the real queue needs the target queue and provides queueClient'
)
assert.deepEqual(
  Object.keys(metas['svc-select'].services).sort(),
  ['edgeQueue', 'kyselyFake', 'queueNoop', 'queueReal', 'store'],
  'every exported pikkuService const is published, under its exported name'
)

// --- dev: several addons, opt-in, reachability, ordering -------------------
const devFile = generated('multi')
const dev = await read(devFile)
assert.deepEqual(
  importedNames(dev),
  ['blob', 'cache', 'loggerPrefix', 'notifier', 'queueNoop'],
  'only what the project reaches, and what that needs, is imported'
)
for (const absent of [
  '/src/unused.js',
  '/src/store.js',
  '/src/queue-real.js',
]) {
  assert.ok(
    !dev.includes(absent),
    `'${absent}' must not appear in the dev file`
  )
}
assert.match(dev, /target: "dev"/)
assert.ok(
  dev.indexOf('registry.add("notify/cache"') <
    dev.indexOf('registry.add("notify/blob"'),
  'blob needs cache, so it runs after it'
)

const { createPlatformServices, serverStartHooks } = await import(
  pathToFileURL(devFile).href
)
const logger = { name: 'runtime-logger' }
const services = await createPlatformServices(
  { NOTIFY_CHANNEL: 'ops' },
  { logger }
)
assert.equal(services.notifier.channel, 'ops')
assert.equal(services.notifier.label, 'dev')
assert.equal(
  services.logger.prefix,
  'dev',
  'a baseline service is replaced by the one service providing it'
)
assert.equal(
  services.notifier.logger,
  services.logger,
  'notifier needs logger, so it runs after the service replacing it'
)
assert.equal(services.noopQueue.kind, 'noop')
assert.equal(services.queueClient, undefined, 'the real queue was not reached')
assert.equal(services.store, undefined, 'no database, so no store service')
assert.deepEqual(
  serverStartHooks.map((h: any) => h.name),
  ['notify/cache', 'notify/blob']
)
for (const hook of serverStartHooks) await hook.run(services)
await services.blob.stop()
await services.cache.stop()
assert.deepEqual(services.events, [
  'start:cache',
  'start:blob',
  'stop:blob',
  'stop:cache',
])
assert.equal(
  (await createPlatformServices({}, { logger })).notifier.channel,
  'default'
)

// --- the database dialect is read from the kysely the target holds ---------
class PostgresAdapter {}
class SqliteAdapter {}
const kyselyOf = (adapter: object) => ({
  getExecutor: () => ({ adapter }),
})
for (const [scenario, engine, adapter, queue] of [
  ['pg', 'postgres', new PostgresAdapter(), false],
  ['sqlite', 'sqlite', new SqliteAdapter(), true],
] as const) {
  const source = await read(generated(scenario))
  assert.deepEqual(
    importedNames(source),
    queue ? ['queueReal', 'store'] : ['store'],
    `${scenario}: one store service, whatever the engine`
  )
  assert.ok(!source.includes('/src/queue-noop.js'), `${scenario}: queueNoop`)
  const mod = await import(pathToFileURL(generated(scenario)).href)
  const built = await mod.createPlatformServices(
    {},
    { kysely: kyselyOf(adapter), queueService: { name: 'dev-queue' } }
  )
  assert.equal(built.store.engine, engine)
  assert.equal(built.store.target, 'dev')
  if (queue) {
    assert.equal(built.queueClient.kind, 'real')
    assert.equal(built.queueClient.queueService.name, 'dev-queue')
  }
}

// --- deploy: the real adapters, the shared per-unit writer ----------------
const scenarioDir = join(verifier, 'scenarios/multi')
const optedIn = (addon: string, names: string[]) =>
  Object.fromEntries(
    names.map((n) => [n, metas[addon].services[n] ?? assert.fail(n)])
  )
const stateOf = (notify: string[], select: string[]) =>
  ({
    pikkuServices: {},
    optedInServices: {
      notify: {
        packageName: '@verifier/svc-notify',
        services: optedIn('svc-notify', notify),
      },
      select: {
        packageName: '@verifier/svc-select',
        services: optedIn('svc-select', select),
      },
    },
    rpc: {
      wireAddonDeclarations: new Map([
        ['notify', { file: join(scenarioDir, 'src/addons.ts') }],
        ['select', { file: join(scenarioDir, 'src/addons.ts') }],
      ]),
    },
  }) as any
// The deploy writer creates files by path and needs the directory to exist, so
// the output lives under the content store (`<root>/private/deploy`).
const deployRoot = resolve(
  verifier,
  '.pikku-runtime/script-content/private/deploy'
)
await store.deleteByPrefix('deploy', '')
const unitCtx = async (
  provider: string,
  name: string,
  target: string,
  extra = {}
) => {
  const unitDir = join(deployRoot, provider, name)
  await putText(store, 'deploy', `${provider}/${name}/.keep`, '')
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
    db: { engine: 'postgres' },
    ...extra,
  } as any
}
const generate = (
  provider: any,
  ctx: any,
  state: any,
  requiredServices: string[]
) =>
  writeUnitPlatformServices({
    provider,
    ctx,
    state,
    projectDir: scenarioDir,
    requiredServices: new Set(requiredServices),
  })

const standalone = new StandaloneProviderAdapter({})
const standaloneCtx = await unitCtx('standalone', 'api', 'server')
const all = stateOf(
  ['notifier', 'loggerPrefix', 'cache', 'blob', 'unitTag', 'unused'],
  ['store', 'queueReal', 'queueNoop']
)
// The unit reaches notifier, blob, store, queueClient and unitTag. Nothing
// reaches `unused` or `noopQueue`, so those are not part of this unit.
const reached = [
  'notifier',
  'logger',
  'blob',
  'store',
  'queueClient',
  'unitTag',
]
const written = await generate(standalone, standaloneCtx, all, reached)
assert.equal(written?.importPath, './platform-services.gen.js')
const standaloneFile = join(standaloneCtx.unitDir, 'platform-services.gen.ts')
const deploySource = await read(standaloneFile)
assert.deepEqual(
  importedNames(deploySource),
  [
    'blob',
    'cache',
    'loggerPrefix',
    'notifier',
    'queueReal',
    'store',
    'unitTag',
  ],
  'deploy selects what the unit reaches'
)
assert.match(deploySource, /target: "deploy"/)
assert.ok(
  !deploySource.includes('/src/queue-noop.js') &&
    !deploySource.includes('/src/unused.js')
)
const deployed = await import(pathToFileURL(standaloneFile).href)
const built = await deployed.createPlatformServices(
  { NOTIFY_CHANNEL: 'ops', PIKKU_UNIT: 'api' },
  {
    logger,
    kysely: kyselyOf(new PostgresAdapter()),
    queueService: { name: 'deploy-queue' },
  }
)
assert.equal(built.store.target, 'deploy')
assert.equal(built.store.engine, 'postgres')
assert.equal(built.queueClient.kind, 'real')
assert.equal(built.queueClient.queueService.name, 'deploy-queue')
assert.equal(built.notifier.label, 'deploy')
assert.equal(built.notifier.channel, 'ops')
assert.equal(built.unitTag, 'api', 'the deploy variant reads the unit from env')
assert.equal(built.noopQueue, undefined)
assert.deepEqual(
  deployed.serverStartHooks.map((h: any) => h.name),
  ['notify/cache', 'notify/blob'],
  'the standalone target runs the server lifecycle, so it lists the hooks'
)

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

// A service with no deploy variant and no common variant that the unit reaches
// is a build error naming it, not a silent omission. Unreached, it is just not
// part of the unit.
await assert.rejects(
  generate(
    standalone,
    await unitCtx('standalone', 'dev-only', 'server'),
    stateOf(['unused'], []),
    ['unused']
  ),
  /Service 'notify\/unused' has no deploy variant and no common variant/
)
const unreached = await generate(
  standalone,
  await unitCtx('standalone', 'unreached', 'server'),
  stateOf(['unused'], []),
  ['logger']
)
assert.equal(unreached, undefined)

// Cloudflare: a Worker supplies cloudflare bindings in env, and the shared
// writer wraps the service providing `kysely` with column coercion.
const cloudflare = new CloudflareProviderAdapter({})
const workerCtx = await unitCtx('cloudflare', 'edge', 'serverless', {
  db: undefined,
  coercionMap: { users: { id: 'int' } },
})
const workerState = stateOf(
  ['unitTag'],
  ['edgeQueue', 'kyselyFake', 'queueReal']
)
const worker = await generate(cloudflare, workerCtx, workerState, [
  'edgeQueue',
  'kysely',
  'unitTag',
])
const workerFile = join(workerCtx.unitDir, 'platform-services.gen.ts')
const workerSource = await read(workerFile)
assert.match(workerSource, /createCoercionPlugin/)
assert.match(
  workerSource,
  /registry\.add\("select\/kyselyFake", withKyselyCoercion\(/
)
const workerServices = await (
  await import(pathToFileURL(workerFile).href)
).createPlatformServices({ QUEUE: 'queue-binding', PIKKU_UNIT: 'edge' }, {})
assert.equal(workerServices.edgeQueue, 'queue-binding')
assert.equal(
  workerServices.kysely.plugins.length,
  1,
  'coercion decorated the kysely a service provides'
)
assert.equal(workerServices.unitTag, 'edge')
const workerEntry = cloudflare.generateEntrySource({
  ...workerCtx,
  platformServices: worker,
})
assert.match(workerEntry, /__pikkuPlatformServices\(env, services\)/)

// The same service on the container (node, env only) has no QUEUE binding, so
// its factory fails closed when the unit starts.
const boxCtx = await unitCtx('cloudflare', 'box', 'server')
const box = await generate(cloudflare, boxCtx, stateOf([], ['edgeQueue']), [
  'edgeQueue',
])
assert.ok(box)
await assert.rejects(
  (
    await import(
      pathToFileURL(join(boxCtx.unitDir, 'platform-services.gen.ts')).href
    )
  ).createPlatformServices({}, {}),
  /Service 'select\/edgeQueue' failed to build: edgeQueue: the QUEUE binding is missing/
)

// A Worker never runs the server lifecycle, so a service with `onServerStart`
// reached by one is a build error naming service and unit; the same services on
// a container (server target) unit work. A service with only a `stop()` has
// nothing to start, so a Worker takes it.
await assert.rejects(
  generate(
    cloudflare,
    await unitCtx('cloudflare', 'edge-hooks', 'serverless', { db: undefined }),
    stateOf(['cache', 'blob'], []),
    ['blob']
  ),
  (error: Error) =>
    /service 'notify\/blob' in unit 'edge-hooks'/.test(error.message) &&
    /onServerStart would never be called/.test(error.message)
)
const containerCtx = await unitCtx('cloudflare', 'box-hooks', 'server')
const container = await generate(
  cloudflare,
  containerCtx,
  stateOf(['cache', 'blob'], []),
  ['blob']
)
assert.ok(container, 'the container unit takes the onServerStart services')
const containerEntry = cloudflare.generateServerEntrySource({
  ...containerCtx,
  lifecycle: { importPath: './lifecycle.js', variable: 'lifecycle' },
  platformServices: container,
})
assert.match(containerEntry, /composeServerLifecycle\(__pikkuLifecycle,/)
assert.match(containerEntry, /__pikkuServerLifecycle\?\.beforeStart/)
assert.ok(
  await generate(
    cloudflare,
    await unitCtx('cloudflare', 'edge-stop', 'serverless', { db: undefined }),
    stateOf(['hookStopOnly'], []),
    ['hookStopOnly']
  ),
  'a service with only a stop() builds into a Worker'
)

// The Worker bundle (esbuild, browser platform) keeps working and carries only
// the services the unit reaches.
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
  'an opted-in service the unit does not reach is not bundled'
)

// Opting in to nothing writes no file and clears a stale one.
const none = await generate(standalone, standaloneCtx, stateOf([], []), [])
assert.equal(none, undefined)
assert.equal(
  await hasKey(store, 'deploy', 'standalone/api/platform-services.gen.ts'),
  false
)

console.log('services: all checks passed')
