import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ErrorCode } from '@pikku/inspector/lite'
import {
  RESOLVE_SDK_PATH,
  RemoteAddonSyncError,
  collectRemoteAddonSdkSpecs,
  createRegistryClient,
  sha512Integrity,
  syncRemoteAddonSdks,
} from './remote-addon-sync.js'
import { readTgz } from './extract-tgz.js'
import { addonGeneratedImport } from './remote-addon-import.js'
import { runUpdate } from '../functions/commands/update.js'

/** A gzipped ustar archive of `files`, written the way `npm pack` lays one out. */
const makeTgz = (
  files: Record<string, string>,
  type: Record<string, string> = {}
): Buffer => {
  const blocks: Buffer[] = []
  for (const [path, body] of Object.entries(files)) {
    const data = Buffer.from(body)
    const header = Buffer.alloc(512)
    header.write(path, 0, 100, 'utf-8')
    header.write('0000644\0', 100)
    header.write('0000000\0', 108)
    header.write('0000000\0', 116)
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('00000000000\0', 136)
    header.write('        ', 148)
    header.write(type[path] ?? '0', 156)
    header.write('ustar\0', 257)
    header.write('00', 263)
    let sum = 0
    for (const byte of header) sum += byte
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

const NAME = '@pikkustudio/addon-cloud-api'

/** The SDK layout from the spec, for `name@version`. */
const sdkFiles = (
  version: string,
  { pikkuCore = '^0.12.0', prefix = 'package/' } = {}
): Record<string, string> => ({
  [`${prefix}manifest.json`]: JSON.stringify({
    name: NAME,
    version,
    pikkuCore,
    contractHash: `hash-${version}`,
  }),
  [`${prefix}rpc/pikku-rpc-wirings-map.remote.gen.d.ts`]:
    'export type RPCMap = {}\n',
  [`${prefix}workflow/pikku-workflow-map.gen.d.ts`]:
    'export type WorkflowMap = {}\n',
  [`${prefix}agent/pikku-agent-map.gen.d.ts`]: 'export type AgentMap = {}\n',
  [`${prefix}function/pikku-functions-meta.gen.json`]: JSON.stringify({
    getProject: { pikkuFuncId: 'getProject', remote: true },
  }),
})

/**
 * An in-memory registry: `resolveSdk` picks the highest published version the
 * range allows, `download` serves its tarball. Counts calls, so a test can
 * prove a sync stayed offline.
 */
const fakeRegistry = (
  published: Record<string, Buffer>,
  { tamper }: { tamper?: (version: string, tgz: Buffer) => Buffer } = {}
) => {
  const calls = {
    resolve: [] as { name: string; range: string }[],
    download: 0,
  }
  return {
    calls,
    resolveSdk: async ({ name, range }: { name: string; range: string }) => {
      calls.resolve.push({ name, range })
      const { default: semver } = await import('semver')
      const version = semver.maxSatisfying(Object.keys(published), range)
      if (!version) throw new Error(`no SDK for ${name}@${range}`)
      return {
        version,
        integrity: sha512Integrity(published[version]!),
        url: `https://sdk.example.test/${version}.tgz?sig=x`,
      }
    },
    download: async (url: string) => {
      calls.download++
      const version = /\/([^/]+)\.tgz/.exec(url)![1]!
      const tgz = published[version]!
      return tamper ? tamper(version, tgz) : tgz
    },
  }
}

/** A project with `src/addons.ts` wiring `NAME@range`. */
const makeProject = (range: string, extra = '') => {
  const rootDir = mkdtempSync(join(tmpdir(), 'pikku-addon-sync-'))
  const file = join(rootDir, 'src', 'addons.ts')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(
    file,
    `import { wireRemoteAddon } from '@pikku/core/addon'

wireRemoteAddon({
  name: 'cloudapi',
  package: '${NAME}@${range}',
  serverUrl: 'https://api.example.com',
})
${extra}`
  )
  return { rootDir, file, config: { rootDir, srcDirectories: ['src'] } }
}

const silentLogger = () => {
  const diagnostics: { severity: string; code: string; message: string }[] = []
  return {
    diagnostics,
    logger: {
      debug: () => {},
      info: () => {},
      diagnostic: (d: { severity: string; code: string; message: string }) =>
        diagnostics.push(d),
    },
  }
}

const sync = async (
  project: ReturnType<typeof makeProject>,
  registry: ReturnType<typeof fakeRegistry>,
  coreVersion: string | null = '0.12.5'
) => {
  const { logger, diagnostics } = silentLogger()
  const specs = await collectRemoteAddonSdkSpecs({
    ...project.config,
    ignoreFiles: [],
  })
  const result = await syncRemoteAddonSdks({
    rootDir: project.rootDir,
    specs,
    resolveSdk: registry.resolveSdk,
    download: registry.download,
    logger,
    coreVersion,
  })
  return { result, diagnostics }
}

const readLock = (rootDir: string) =>
  JSON.parse(readFileSync(join(rootDir, 'pikku-addons.lock'), 'utf-8'))

const PUBLISHED = {
  '1.4.0': makeTgz(sdkFiles('1.4.0')),
  '1.4.2': makeTgz(sdkFiles('1.4.2')),
  '2.0.0': makeTgz(sdkFiles('2.0.0', { pikkuCore: '^0.13.0' })),
}

describe('readTgz', () => {
  test('reads the files and refuses paths that climb out', () => {
    const entries = readTgz(makeTgz({ 'package/manifest.json': '{}' }))
    assert.deepEqual(
      entries.map((e) => e.path),
      ['package/manifest.json']
    )
    assert.throws(() => readTgz(makeTgz({ '../evil.txt': 'x' })), /escapes/)
    assert.throws(() => readTgz(makeTgz({ '/etc/evil': 'x' })), /escapes/)
  })

  test('refuses links', () => {
    assert.throws(
      () => readTgz(makeTgz({ 'package/link': '' }, { 'package/link': '2' })),
      /not a regular file/
    )
  })
})

describe('remote addon SDK sync', () => {
  test('a lock miss resolves the range, extracts the SDK and writes the lock', async () => {
    const project = makeProject('^1.4.0')
    try {
      const registry = fakeRegistry(PUBLISHED)
      const { result } = await sync(project, registry)
      assert.deepEqual(registry.calls.resolve, [
        { name: NAME, range: '^1.4.0' },
      ])
      assert.equal(result.sdks[0]!.version, '1.4.2')
      assert.equal(result.sdks[0]!.source, 'downloaded')
      assert.equal(result.lockChanged, true)
      assert.deepEqual(readLock(project.rootDir), {
        lockfileVersion: 1,
        sdks: {
          [NAME]: {
            range: '^1.4.0',
            version: '1.4.2',
            integrity: sha512Integrity(PUBLISHED['1.4.2']),
          },
        },
      })
      const dir = join(project.rootDir, '.pikku', 'remote', `${NAME}@1.4.2`)
      // npm pack's package/ prefix is stripped.
      assert.ok(existsSync(join(dir, 'manifest.json')))
      assert.ok(
        existsSync(join(dir, 'rpc', 'pikku-rpc-wirings-map.remote.gen.d.ts'))
      )
      assert.ok(
        existsSync(join(dir, 'function', 'pikku-functions-meta.gen.json'))
      )
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('a lock hit with the files on disk never touches the network', async () => {
    const project = makeProject('^1.4.0')
    try {
      await sync(project, fakeRegistry(PUBLISHED))
      const lockBefore = readFileSync(
        join(project.rootDir, 'pikku-addons.lock'),
        'utf-8'
      )
      const offline = {
        calls: { resolve: [], download: 0 },
        resolveSdk: async () => {
          throw new Error('offline')
        },
        download: async () => {
          throw new Error('offline')
        },
      } as unknown as ReturnType<typeof fakeRegistry>
      const { result } = await sync(project, offline)
      assert.equal(result.sdks[0]!.source, 'cached')
      assert.equal(result.lockChanged, false)
      assert.equal(
        readFileSync(join(project.rootDir, 'pikku-addons.lock'), 'utf-8'),
        lockBefore
      )
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('a pinned version is kept when a moved range still allows it', async () => {
    const project = makeProject('^1.4.0')
    try {
      await sync(project, fakeRegistry(PUBLISHED))
      const file = readFileSync(project.file, 'utf-8')
      writeFileSync(project.file, file.replace('^1.4.0', '~1.4.1'))
      const registry = fakeRegistry(PUBLISHED)
      const { result } = await sync(project, registry)
      assert.deepEqual(registry.calls.resolve, [])
      assert.equal(result.sdks[0]!.version, '1.4.2')
      assert.equal(readLock(project.rootDir).sdks[NAME].range, '~1.4.1')
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('a pinned version without its files is fetched at exactly that version', async () => {
    const project = makeProject('^1.4.0')
    try {
      await sync(project, fakeRegistry(PUBLISHED))
      rmSync(join(project.rootDir, '.pikku'), { recursive: true, force: true })
      // 1.4.9 has been published since; the lock still wins.
      const registry = fakeRegistry({
        ...PUBLISHED,
        '1.4.9': makeTgz(sdkFiles('1.4.9')),
      })
      const { result } = await sync(project, registry)
      assert.deepEqual(registry.calls.resolve, [{ name: NAME, range: '1.4.2' }])
      assert.equal(result.sdks[0]!.version, '1.4.2')
      assert.equal(result.lockChanged, false)
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('an integrity mismatch fails closed and installs nothing', async () => {
    const project = makeProject('^1.4.0')
    try {
      const registry = fakeRegistry(PUBLISHED, {
        tamper: () => makeTgz(sdkFiles('1.4.2', { pikkuCore: '*' })),
      })
      await assert.rejects(
        sync(project, registry),
        (e: unknown) =>
          e instanceof RemoteAddonSyncError &&
          e.code === ErrorCode.REMOTE_ADDON_SDK_INTEGRITY_MISMATCH
      )
      assert.equal(
        existsSync(join(project.rootDir, '.pikku', 'remote', `${NAME}@1.4.2`)),
        false
      )
      assert.equal(
        existsSync(join(project.rootDir, 'pikku-addons.lock')),
        false
      )
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('a registry serving other bytes for a pinned version fails closed', async () => {
    const project = makeProject('^1.4.0')
    try {
      await sync(project, fakeRegistry(PUBLISHED))
      rmSync(join(project.rootDir, '.pikku'), { recursive: true, force: true })
      const republished = fakeRegistry({
        ...PUBLISHED,
        '1.4.2': makeTgz(sdkFiles('1.4.2', { pikkuCore: '*' })),
      })
      await assert.rejects(
        sync(project, republished),
        (e: unknown) =>
          e instanceof RemoteAddonSyncError &&
          e.code === ErrorCode.REMOTE_ADDON_SDK_INTEGRITY_MISMATCH
      )
      assert.equal(republished.calls.download, 0)
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('warns when the SDK was generated against another @pikku/core', async () => {
    const project = makeProject('^2.0.0')
    try {
      const { diagnostics } = await sync(
        project,
        fakeRegistry(PUBLISHED),
        '0.12.5'
      )
      assert.deepEqual(
        diagnostics.map((d) => [d.severity, d.code]),
        [['warn', ErrorCode.REMOTE_ADDON_SDK_CORE_MISMATCH]]
      )
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('the same package at two ranges is refused', async () => {
    const project = makeProject(
      '^1.4.0',
      `wireRemoteAddon({ name: 'other', package: '${NAME}@^2.0.0', serverUrl: '' })\n`
    )
    try {
      await assert.rejects(
        collectRemoteAddonSdkSpecs({ ...project.config, ignoreFiles: [] }),
        /one SDK per package/
      )
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('an unversioned wireRemoteAddon is left to node_modules', async () => {
    const project = makeProject('^1.4.0')
    try {
      writeFileSync(
        project.file,
        readFileSync(project.file, 'utf-8').replace('@^1.4.0', '')
      )
      assert.deepEqual(
        await collectRemoteAddonSdkSpecs({
          ...project.config,
          ignoreFiles: [],
        }),
        []
      )
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })
})

describe('createRegistryClient', () => {
  test('POSTs { data: { name, range } } with the bearer, and downloads without it', async () => {
    const requests: { url: string; init?: RequestInit }[] = []
    const fetch = (async (url: URL | string, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      if (String(url).endsWith(RESOLVE_SDK_PATH)) {
        return new Response(
          JSON.stringify({
            version: '1.4.2',
            integrity: 'sha512-x',
            url: 'https://cdn.example.test/a.tgz?sig=1',
          }),
          { status: 200 }
        )
      }
      return new Response(new Uint8Array([1, 2, 3]))
    }) as typeof globalThis.fetch
    const client = createRegistryClient({
      registry: 'https://registry.example.test/',
      token: 'tok',
      fetch,
    })
    assert.deepEqual(await client.resolveSdk({ name: NAME, range: '^1.4.0' }), {
      version: '1.4.2',
      integrity: 'sha512-x',
      url: 'https://cdn.example.test/a.tgz?sig=1',
    })
    assert.equal(
      requests[0]!.url,
      'https://registry.example.test/rpc/registry:resolveSdk'
    )
    assert.equal(requests[0]!.init?.method, 'POST')
    assert.deepEqual(JSON.parse(requests[0]!.init!.body as string), {
      data: { name: NAME, range: '^1.4.0' },
    })
    assert.equal(
      (requests[0]!.init!.headers as Record<string, string>).authorization,
      'Bearer tok'
    )
    assert.deepEqual(
      [...(await client.download('https://cdn.example.test/a.tgz?sig=1'))],
      [1, 2, 3]
    )
    assert.equal(requests[1]!.init, undefined)
  })

  test('never sends the bearer to a plain-http registry', async () => {
    let headers: Record<string, string> = {}
    const fetch = (async (_url: URL, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>
      return new Response(
        JSON.stringify({
          version: '1.0.0',
          integrity: 'sha512-x',
          url: 'https://a/b.tgz',
        })
      )
    }) as typeof globalThis.fetch
    await createRegistryClient({
      registry: 'http://registry.example.test',
      token: 'tok',
      fetch,
    }).resolveSdk({ name: NAME, range: '*' })
    assert.equal(headers.authorization, undefined)
  })
})

describe('codegen imports from a versioned remote addon', () => {
  test('point into the locked SDK, relative to the generated file', async () => {
    const project = makeProject('^1.4.0')
    try {
      await sync(project, fakeRegistry(PUBLISHED))
      const from = join(
        project.rootDir,
        '.pikku',
        'rpc',
        'pikku-rpc-wirings-map.gen.d.ts'
      )
      assert.equal(
        addonGeneratedImport(
          { package: NAME, range: '^1.4.0' },
          'rpc/pikku-rpc-wirings-map.remote.gen.js',
          from,
          project.rootDir
        ),
        `../remote/${NAME}@1.4.2/rpc/pikku-rpc-wirings-map.remote.gen.js`
      )
      const fromSrc = join(project.rootDir, 'src', 'gen', 'workflow.d.ts')
      assert.equal(
        addonGeneratedImport(
          { package: NAME, range: '^1.4.0' },
          'workflow/pikku-workflow-map.gen.d.js',
          fromSrc,
          project.rootDir
        ),
        `../../.pikku/remote/${NAME}@1.4.2/workflow/pikku-workflow-map.gen.d.js`
      )
      // An unversioned addon still imports through its package.
      assert.equal(
        addonGeneratedImport(
          { package: NAME },
          'agent/pikku-agent-map.gen.d.js',
          from,
          project.rootDir
        ),
        `${NAME}/.pikku/agent/pikku-agent-map.gen.d.js`
      )
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })
})

describe('pikku update with a versioned wireRemoteAddon', () => {
  const update = async (
    project: ReturnType<typeof makeProject>,
    registry: ReturnType<typeof fakeRegistry>,
    apply: boolean,
    resync?: () => Promise<unknown>
  ) => {
    writeFileSync(
      join(project.rootDir, 'package.json'),
      `${JSON.stringify({ name: 'app', dependencies: { '@pikku/core': '^0.12.5' } }, null, 2)}\n`
    )
    return runUpdate({
      rootDir: project.rootDir,
      apply,
      updatePeers: false,
      install: true,
      tag: 'latest',
      registry: 'https://registry.npmjs.org',
      fetchPackument: async () => ({
        'dist-tags': { latest: '0.12.5' },
        versions: { '0.12.5': {} },
      }),
      remoteAddons: {
        ...project.config,
        resolveSdk: registry.resolveSdk,
        resync,
      },
    })
  }

  test('reports the SDK as an entry, latest from the registry', async () => {
    const project = makeProject('^1.4.0')
    try {
      await sync(project, fakeRegistry(PUBLISHED))
      const registry = fakeRegistry(PUBLISHED)
      const result = await update(project, registry, false)
      assert.deepEqual(registry.calls.resolve, [{ name: NAME, range: '*' }])
      const entry = result.entries.find((e) => e.field === 'wireRemoteAddon')
      assert.deepEqual(entry, {
        package: NAME,
        manifest: 'src/addons.ts',
        field: 'wireRemoteAddon',
        range: '^1.4.0',
        installed: '1.4.2',
        latest: '2.0.0',
        target: '^2.0.0',
        status: 'outdated',
      })
      // The npm entry is untouched by the addon check.
      assert.ok(
        result.entries.some(
          (e) => e.package === '@pikku/core' && e.field === 'dependencies'
        )
      )
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('stale-install when the SDK on disk does not match the lock', async () => {
    const project = makeProject('^2.0.0')
    try {
      const result = await update(project, fakeRegistry(PUBLISHED), false)
      const entry = result.entries.find((e) => e.field === 'wireRemoteAddon')!
      assert.equal(entry.status, 'stale-install')
      assert.equal(entry.installed, null)
      assert.match(entry.reason!, /pikku all/)
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('--update rewrites the literal in place and re-syncs', async () => {
    const project = makeProject('^1.4.0')
    try {
      await sync(project, fakeRegistry(PUBLISHED))
      let resynced = 0
      const result = await update(
        project,
        fakeRegistry(PUBLISHED),
        true,
        async () => {
          resynced++
        }
      )
      assert.deepEqual(result.written, ['src/addons.ts'])
      assert.equal(resynced, 1)
      assert.equal(result.addonsSynced, true)
      const source = readFileSync(project.file, 'utf-8')
      assert.match(
        source,
        new RegExp(`package: '${NAME.replace('/', '\\/')}@\\^2\\.0\\.0',`)
      )
      assert.doesNotMatch(source, /\^1\.4\.0/)
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })

  test('an SDK built for another @pikku/core is a peer finding', async () => {
    const project = makeProject('^2.0.0')
    try {
      await sync(project, fakeRegistry(PUBLISHED))
      const result = await update(project, fakeRegistry(PUBLISHED), false)
      assert.deepEqual(
        result.peers.map((p) => [p.package, p.peer, p.required, p.found]),
        [[`${NAME}@2.0.0`, '@pikku/core', '^0.13.0', '^0.12.5']]
      )
    } finally {
      rmSync(project.rootDir, { recursive: true, force: true })
    }
  })
})
