import { strict as assert } from 'node:assert'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { getPikkuCLIConfig, PikkuCLIConfigError } from './pikku-cli-config.js'
import { mergeConfigLayers } from './pikku-cli-config-extends.js'

const silentLogger = { error() {}, warn() {}, info() {} } as never

describe('pikku config extends', () => {
  const tempDirs: string[] = []
  after(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  })

  const makeRoot = async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-extends-'))
    tempDirs.push(root)
    return root
  }

  const writeJson = async (file: string, value: unknown) => {
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, JSON.stringify(value))
  }

  const base = {
    rootDir: '.',
    srcDirectories: ['packages/functions/src'],
    packageMappings: { a: 'pkg-a' },
    outDir: 'packages/functions/.pikku',
    tsconfig: 'tsconfig.json',
    filters: {},
    ignoreFiles: ['**/*.test.ts'],
    clientFiles: { fetchFile: 'client/fetch.gen.ts' },
    scaffold: { rpc: true, pikkuDir: 'packages/functions/src/scaffold' },
    blocks: ['@x/blocks'],
  }

  const load = (file: string) => getPikkuCLIConfig(silentLogger, file, [])

  test('appends a child srcDirectory to the parent ones', async () => {
    const root = await makeRoot()
    await writeJson(join(root, 'pikku.config.json'), base)
    await writeJson(join(root, 'pikku.cloud.json'), {
      extends: './pikku.config.json',
      srcDirectories: ['packages/addon/wire'],
    })

    const config = await load(join(root, 'pikku.cloud.json'))

    assert.deepEqual(config.srcDirectories, [
      'packages/functions/src',
      'packages/addon/wire',
    ])
    assert.equal(config.rootDir, root)
  })

  test('de-duplicates a srcDirectory the child repeats, by resolved path', async () => {
    const root = await makeRoot()
    await writeJson(join(root, 'pikku.config.json'), base)
    await writeJson(join(root, 'pikku.cloud.json'), {
      extends: './pikku.config.json',
      srcDirectories: ['./packages/functions/src', 'packages/addon/wire'],
    })

    const config = await load(join(root, 'pikku.cloud.json'))

    assert.deepEqual(config.srcDirectories, [
      'packages/functions/src',
      'packages/addon/wire',
    ])
  })

  test('resolves each layer’s paths against the file that declares them', async () => {
    const root = await makeRoot()
    await writeJson(join(root, 'pikku.config.json'), base)
    await writeJson(join(root, 'apps', 'web', 'pikku.config.json'), {
      extends: '../../pikku.config.json',
      srcDirectories: ['src'],
      clientFiles: { nextBackendFile: './pikku-nextjs.gen.ts' },
      nextHTTPFile: './pikku/nextjs-http.gen.ts',
    })

    const config = await load(join(root, 'apps', 'web', 'pikku.config.json'))

    // rootDir is inherited, so the child's src comes back relative to it
    assert.equal(config.rootDir, root)
    assert.deepEqual(config.srcDirectories, [
      'packages/functions/src',
      join('apps', 'web', 'src'),
    ])
    assert.equal(
      config.clientFiles?.fetchFile,
      join(root, 'client', 'fetch.gen.ts')
    )
    assert.equal(
      config.clientFiles?.nextBackendFile,
      join(root, 'apps', 'web', 'pikku-nextjs.gen.ts')
    )
    assert.equal(
      config.nextHTTPFile,
      join(root, 'apps', 'web', 'pikku', 'nextjs-http.gen.ts')
    )
    assert.equal(config.tsconfig, join(root, 'tsconfig.json'))
  })

  test('deep-merges objects, and null removes a parent key', async () => {
    const root = await makeRoot()
    await writeJson(join(root, 'pikku.config.json'), base)
    await writeJson(join(root, 'child.json'), {
      extends: './pikku.config.json',
      packageMappings: { b: 'pkg-b' },
      scaffold: { workflow: true },
      schema: { additionalProperties: true },
      clientFiles: { fetchFile: null, mcpJsonFile: '.pikku/mcp.gen.json' },
    })

    const config = await load(join(root, 'child.json'))

    assert.deepEqual(config.packageMappings, { a: 'pkg-a', b: 'pkg-b' })
    assert.equal(config.scaffold?.rpc, true)
    assert.equal(config.scaffold?.workflow, true)
    assert.equal(
      config.scaffold?.pikkuDir,
      join(root, 'packages', 'functions', 'src', 'scaffold')
    )
    assert.equal(config.schema?.additionalProperties, true)
    assert.equal(config.schema?.supportsImportAttributes, true)
    assert.deepEqual(config.clientFiles, {
      mcpJsonFile: join(root, '.pikku', 'mcp.gen.json'),
    })
  })

  test('a child replaces every other array rather than appending to it', async () => {
    const root = await makeRoot()
    await writeJson(join(root, 'pikku.config.json'), base)
    await writeJson(join(root, 'child.json'), {
      extends: './pikku.config.json',
      ignoreFiles: ['**/*.spec.ts'],
      blocks: ['@y/blocks'],
    })

    const config = await load(join(root, 'child.json'))

    assert.deepEqual(config.ignoreFiles, ['**/*.spec.ts'])
    assert.deepEqual(config.blocks, ['@y/blocks'])
  })

  test('derives output files from the merged outDir, not the parent’s', async () => {
    const root = await makeRoot()
    await writeJson(join(root, 'pikku.config.json'), base)
    await writeJson(join(root, 'child.json'), {
      extends: './pikku.config.json',
      outDir: '.pikku-cloud',
    })

    const config = await load(join(root, 'child.json'))

    assert.equal(config.outDir, join(root, '.pikku-cloud'))
    assert.ok(
      config.functionsFile.startsWith(join(root, '.pikku-cloud')),
      config.functionsFile
    )
  })

  test('a child that sets rootDir resolves it against its own file', async () => {
    const root = await makeRoot()
    await writeJson(join(root, 'pikku.config.json'), base)
    await writeJson(join(root, 'apps', 'web', 'pikku.config.json'), {
      extends: '../../pikku.config.json',
      rootDir: '.',
    })

    const config = await load(join(root, 'apps', 'web', 'pikku.config.json'))

    assert.equal(config.rootDir, join(root, 'apps', 'web'))
    assert.deepEqual(config.srcDirectories, [
      join('..', '..', 'packages', 'functions', 'src'),
    ])
  })

  test('merges a chain of three configs', async () => {
    const root = await makeRoot()
    await writeJson(join(root, 'pikku.config.json'), base)
    await writeJson(join(root, 'b.json'), {
      extends: './pikku.config.json',
      srcDirectories: ['b'],
    })
    await writeJson(join(root, 'c.json'), {
      extends: './b.json',
      srcDirectories: ['c'],
    })

    const config = await load(join(root, 'c.json'))

    assert.deepEqual(config.srcDirectories, [
      'packages/functions/src',
      'b',
      'c',
    ])
  })

  test('refuses an extends cycle by name', async () => {
    const root = await makeRoot()
    await writeJson(join(root, 'a.json'), { ...base, extends: './b.json' })
    await writeJson(join(root, 'b.json'), { extends: './a.json' })

    await assert.rejects(
      () => load(join(root, 'a.json')),
      (e: unknown) =>
        e instanceof PikkuCLIConfigError && /cycle/.test(e.message)
    )
  })
})

describe('mergeConfigLayers', () => {
  test('concatenates srcDirectories only when both layers set it', () => {
    assert.deepEqual(
      mergeConfigLayers({ srcDirectories: ['/a'] }, { outDir: '/o' }),
      { srcDirectories: ['/a'], outDir: '/o' }
    )
    assert.deepEqual(
      mergeConfigLayers(
        { srcDirectories: ['/a'] },
        { srcDirectories: ['/a', '/b'] }
      ),
      { srcDirectories: ['/a', '/b'] }
    )
  })

  test('does not concatenate nested arrays', () => {
    assert.deepEqual(
      mergeConfigLayers(
        { filters: { tags: ['x'] } },
        { filters: { tags: ['y'] } }
      ),
      { filters: { tags: ['y'] } }
    )
  })
})
