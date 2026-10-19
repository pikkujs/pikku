import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { build, type Plugin } from 'esbuild'

import { CloudflareProviderAdapter } from './adapter.js'
import { coercionContributor } from './coercion-contributor.js'

const unit = {
  name: 'api',
  role: 'function',
  target: 'server',
  services: [
    { capability: 'queue', sourceServiceName: 'queueService' },
    { capability: 'kv', sourceServiceName: 'browser' },
  ],
  handlers: ['http', 'queue'],
  dependsOn: [],
} as never

const ctx = {
  unit,
  unitDir: '/build/api',
  bootstrapPath: './.pikku/pikku-bootstrap.gen.js',
  configImport: `import { createConfig } from './config.js'`,
  configVar: 'createConfig',
  servicesImport: `import { createSingletonServices } from './services.js'`,
  servicesVar: 'createSingletonServices',
  singletonServicesImport: '',
  servicesType: 'Record<string, unknown>',
  mcpImport: '',
  mcpServerOption: '',
} as never

const platformServices = { importPath: './platform-services.gen.js' }
const withServices = { ...(ctx as object), platformServices } as never

describe('CloudflareProviderAdapter contributors', () => {
  test('without a generated file the entries run no contributors', () => {
    const adapter = new CloudflareProviderAdapter({})
    assert.doesNotMatch(adapter.generateEntrySource(ctx), /ContributorServices/)
    assert.doesNotMatch(
      adapter.generateServerEntrySource(ctx),
      /ContributorServices/
    )
  })

  test('a worker entry imports the generated file and merges what it returns', () => {
    const source = new CloudflareProviderAdapter({}).generateEntrySource(
      withServices
    )

    assert.match(
      source,
      /import \{ createPlatformServices as __pikkuContributorServices \} from '\.\/platform-services\.gen\.js'/
    )
    assert.match(
      source,
      /Object\.assign\(services, await __pikkuContributorServices\(env, services\)\)/
    )
  })

  test('the container entry imports the same file', () => {
    const source = new CloudflareProviderAdapter({}).generateServerEntrySource(
      withServices
    )
    assert.match(source, /__pikkuContributorServices\(env, services\)/)
  })

  test('a worker supplies env and cloudflare bindings', () => {
    const support = new CloudflareProviderAdapter({}).contributorSupport({
      ...(ctx as object),
      unit: { ...(unit as object), target: 'serverless' },
    } as never)
    assert.deepEqual([...support.supported].sort(), ['cloudflare', 'env'])
    assert.ok(support.runtimeServices.includes('queueService'))
  })

  test('the container holds no bindings, so it supplies env alone', () => {
    const support = new CloudflareProviderAdapter({}).contributorSupport({
      ...(ctx as object),
      unit: { ...(unit as object), target: 'server' },
    } as never)
    assert.deepEqual([...support.supported], ['env'])
    assert.ok(!support.runtimeServices.includes('queueService'))
  })

  test('the platform is widened with the unit being generated', () => {
    const platform = new CloudflareProviderAdapter({}).contributorSupport(ctx)
      .widenPlatform!({
      serviceNames: [],
      needsQueue: false,
      needsWorkflow: false,
      needsAgent: false,
    }) as unknown as { unit: { name: string } }
    assert.equal(platform.unit.name, 'api')
  })
})

describe('CloudflareProviderAdapter column coercion', () => {
  const frameworkNames = (options: object) =>
    (
      new CloudflareProviderAdapter(options).contributorSupport(ctx)
        .framework ?? []
    ).map((f) => f.name)

  test('the adapter selects the coercion contributor itself, as optional', () => {
    const [coercion] =
      new CloudflareProviderAdapter({}).contributorSupport(ctx).framework ?? []
    assert.equal(coercion?.name, 'kysely-coercion')
    assert.equal(coercion?.optional, true)
    assert.equal(coercion?.contributor, coercionContributor)
    assert.match(coercion!.module, /coercion-contributor\.(ts|js)$/)
  })

  test('a platform that applies the map itself can turn it off', () => {
    assert.deepEqual(frameworkNames({ coercion: false }), [])
  })

  test('the contributor decorates kysely: no provides, needs kysely, only with a map', () => {
    assert.deepEqual(coercionContributor.provides, [])
    assert.deepEqual(coercionContributor.needs, ['kysely'])
    const platform = {
      serviceNames: [],
      needsQueue: false,
      needsWorkflow: false,
      needsAgent: false,
    }
    assert.equal(coercionContributor.when?.(platform), false)
    assert.equal(
      coercionContributor.when?.({
        ...platform,
        db: { engine: 'sqlite', coercionMap: { t: { d: 'date' } } },
      }),
      true
    )
  })

  test('it wraps the kysely it is given with the platform map', async () => {
    let plugin: unknown
    const services = {
      kysely: {
        withPlugin: (p: unknown) => {
          plugin = p
          return 'wrapped'
        },
      },
    } as Record<string, any>
    await coercionContributor.run(
      services,
      {},
      {},
      {
        serviceNames: [],
        needsQueue: false,
        needsWorkflow: false,
        needsAgent: false,
        db: { engine: 'sqlite', coercionMap: { t: { d: 'date' } } },
      }
    )
    assert.equal(services.kysely, 'wrapped')
    assert.ok(plugin)
  })
})

describe('CloudflareProviderAdapter addon registration', () => {
  test('a worker builds its services only after loadAddons()', () => {
    const adapter = new CloudflareProviderAdapter()
    assert.equal(adapter.lazyAddonRegistration, true)

    const source = adapter.generateEntrySource(ctx)
    assert.match(
      source,
      /import \* as __pikkuBootstrap from '\.\/\.pikku\/pikku-bootstrap\.gen\.js'/
    )
    assert.doesNotMatch(source, /^import '\.\/\.pikku\/pikku-bootstrap/m)
    assert.ok(
      source.includes(
        [
          '  await (__pikkuBootstrap as { loadAddons?: () => Promise<unknown> }).loadAddons?.()',
          '  return createSingletonServices(...args)',
        ].join('\n')
      )
    )
    assert.match(
      source,
      /createSingletonServices: createSingletonServicesAfterAddons/
    )
  })

  test('the container keeps its eager bootstrap', () => {
    const source = new CloudflareProviderAdapter().generateServerEntrySource(
      ctx
    )
    assert.match(source, /^import '\.\/\.pikku\/pikku-bootstrap\.gen\.js'/m)
    assert.doesNotMatch(source, /loadAddons/)
  })
})

const inboxUnit = {
  ...(unit as object),
  handlers: [
    {
      type: 'fetch',
      routes: [
        {
          method: 'post',
          route: '/__pikku/queue-job',
          pikkuFuncId: 'runRemoteQueueJob',
        },
      ],
    },
    { type: 'queue', queueName: 'emails' },
  ],
} as never

const inboxCtx = { ...(ctx as object), unit: inboxUnit } as never

describe('CloudflareProviderAdapter remote job inbox', () => {
  test('the container entry runs on the bun server and mounts no runtime inbox', () => {
    const source = new CloudflareProviderAdapter().generateServerEntrySource(
      ctx
    )

    assert.match(source, /from '@pikku\/bun-server'/)
    assert.doesNotMatch(source, /node-http-server|dispatchJobs/)
  })

  test('httpQueueJobs stands down where the unit wires the inbox', () => {
    const adapter = new CloudflareProviderAdapter({ httpQueueJobs: true })

    assert.match(adapter.generateEntrySource(ctx), /httpQueueJobs: true/)
    assert.match(adapter.generateEntrySource(inboxCtx), /httpQueueJobs: false/)
  })
})

describe('node builtins on Workers', () => {
  test('node:fs is stubbed rather than left external', () => {
    const adapter = new CloudflareProviderAdapter()
    const externals = adapter.getExternals()

    assert.ok(!externals.includes('node:*'))
    assert.ok(!externals.includes('node:fs'))
    assert.ok(externals.includes('node:path'))
    assert.ok(adapter.getStubModules().includes('^(node:)?fs$'))
    assert.ok(adapter.getStubModules().includes('^(node:)?fs/promises$'))
  })

  test('fs still aliases to its prefixed form so the stub can match it', () => {
    assert.equal(new CloudflareProviderAdapter().getAliases()['fs'], 'node:fs')
  })

  // Mirrors the dead-module stub plugin in the CLI's NodeBundler: esbuild runs
  // its `onResolve` hooks on the specifier as written, before `alias` rewrites
  // it, so a stub pattern has to match the bare form as well as `node:`.
  const stubPlugin = (patterns: string[]): Plugin => ({
    name: 'pikku-dead-module-stub',
    setup(b) {
      const filter = new RegExp(patterns.join('|'))
      b.onResolve({ filter }, (args) => ({
        path: args.path,
        namespace: 'pikku-stub',
      }))
      b.onLoad({ filter: /.*/, namespace: 'pikku-stub' }, () => ({
        contents: 'module.exports = {}',
        loader: 'js',
      }))
    },
  })

  const bundle = async (specifiers: string[]) => {
    const adapter = new CloudflareProviderAdapter()
    const dir = await mkdtemp(join(tmpdir(), 'pikku-cf-stub-'))
    try {
      await mkdir(dir, { recursive: true })
      const entry = join(dir, 'entry.mjs')
      await writeFile(
        entry,
        specifiers
          .map((s, i) => `import * as m${i} from '${s}'\nconsole.log(m${i})`)
          .join('\n')
      )
      const result = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        platform: 'neutral',
        format: 'esm',
        logLevel: 'silent',
        external: adapter.getExternals(),
        alias: adapter.getAliases(),
        plugins: [stubPlugin(adapter.getStubModules())],
      })
      return result.outputFiles[0].text
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  test('unsupported builtins are stubbed in both bare and node: form', async () => {
    const specifiers = [
      'fs',
      'node:fs',
      'fs/promises',
      'node:fs/promises',
      'child_process',
      'node:child_process',
    ]
    const output = await bundle(specifiers)

    for (const s of specifiers) {
      assert.ok(
        !new RegExp(`from\\s*["']${s}["']|import\\s*["']${s}["']`).test(output),
        `${s} must not be imported by the bundle`
      )
    }
    assert.doesNotMatch(
      output,
      /(?:from|import)\s*["'](?:node:)?(?:fs|child_process)/
    )
  })

  test('supported builtins are still left external', async () => {
    const supported = ['path', 'stream', 'crypto', 'async_hooks']
    const output = await bundle(supported.flatMap((s) => [s, `node:${s}`]))

    for (const s of supported) {
      assert.match(output, new RegExp(`from\\s*["']node:${s}["']`))
    }
  })
})

const mcpUnit = {
  name: 'mcp-server',
  role: 'mcp',
  target: 'serverless',
  services: [],
  handlers: [{ type: 'fetch', routes: [] }],
  dependsOn: [],
} as never

const mcpCtx = (overrides: Record<string, unknown>) =>
  ({
    ...(ctx as Record<string, unknown>),
    unit: mcpUnit,
    unitDir: '/build/mcp-server',
    ...overrides,
  }) as never

describe('CloudflareProviderAdapter MCP entries', () => {
  test('an mcp unit with a surface mounts it', () => {
    const source = new CloudflareProviderAdapter({}).generateEntrySource(
      mcpCtx({
        mcpImport: `import mcpJson from './.pikku/mcp/mcp.gen.json' with { type: 'json' }`,
        mcpServerOption: 'mcpJson, ',
      })
    )

    assert.match(
      source,
      /import { createCloudflareMCPHandler } from '@pikku\/cloudflare\/mcp'/
    )
    assert.match(
      source,
      /import mcpJson from '\.\/\.pikku\/mcp\/mcp\.gen\.json'/
    )
    assert.match(source, /createCloudflareMCPHandler\(.*, \{ mcpJson \}\)/s)
  })

  test('a custom mcpPath reaches the handler', () => {
    const source = new CloudflareProviderAdapter({}).generateEntrySource(
      mcpCtx({
        mcpImport: `import mcpJson from './.pikku/mcp/mcp.weather.gen.json' with { type: 'json' }`,
        mcpServerOption: 'mcpJson, mcpPath: "/connectors/weather", ',
      })
    )

    assert.match(source, /\{ mcpJson, mcpPath: "\/connectors\/weather" \}/)
  })

  // Without a surface there is nothing to serve, so the unit must not pull the
  // MCP SDK into its bundle just to answer 404s.
  test('an mcp unit with no surface stays an ordinary worker', () => {
    const source = new CloudflareProviderAdapter({}).generateEntrySource(
      mcpCtx({ mcpImport: '', mcpServerOption: '' })
    )

    assert.match(
      source,
      /export default createCloudflareWorkerHandler\(\{ createConfig/
    )
    assert.equal(source.includes('@pikku/cloudflare/mcp'), false)
  })
})

describe('NODE_ENV on Workers', () => {
  // Core's `isProduction()` gates whether a 5xx response carries the error
  // message and stack. Under nodejs_compat a Worker has a `process` but no
  // NODE_ENV, so without a pin `isProduction()` is false and every 500 leaks.
  // This runs core's real `env.ts`, built with and without the adapter define.
  const envSource = new URL('../../../core/src/env.ts', import.meta.url)
    .pathname

  const isProductionBuiltWith = async (
    define: Record<string, string> | undefined
  ): Promise<boolean> => {
    const result = await build({
      stdin: {
        contents: `export { isProduction } from ${JSON.stringify(envSource)}`,
        resolveDir: dirname(envSource),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'neutral',
      conditions: ['workerd', 'worker', 'browser'],
      define,
    })
    const code = result.outputFiles[0]!.text
    const original = process.env.NODE_ENV
    delete process.env.NODE_ENV
    try {
      const mod = await import(
        `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
      )
      return mod.isProduction()
    } finally {
      if (original !== undefined) process.env.NODE_ENV = original
    }
  }

  test('without the define an unset NODE_ENV is not production', async () => {
    assert.equal(await isProductionBuiltWith(undefined), false)
  })

  test('the adapter define makes the bundle production', async () => {
    const adapter = new CloudflareProviderAdapter({})
    assert.equal(await isProductionBuiltWith(adapter.getDefine()), true)
  })
})
