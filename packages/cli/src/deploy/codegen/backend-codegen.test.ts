import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { getInitialInspectorState } from '@pikku/inspector'
import { generateBackendCodegen } from './per-unit-codegen.js'
import { selectBackends } from '../../utils/select-backends.js'
import { parseCLIFilters } from '../../utils/parse-cli-filters.js'

const dirs: string[] = []

// file-import-path.windows.test.ts swaps node:path for its win32 flavour for the
// rest of a full `bun test` process, and every mkdtemp after it gets a
// backslashed path. Run these where paths are real.
const pathsAreBroken = () => join('a', 'b') !== 'a/b'
after(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true })
})

// A stand-in for `pikku all`: records the flags it was started with into the
// --outDir it was given, which is all the orchestration is responsible for.
const fakePikku = async (root: string) => {
  const bin = join(root, 'fake-pikku.mjs')
  await writeFile(
    bin,
    `import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
const args = process.argv.slice(2)
const out = args.find((a) => a.startsWith('--outDir=')).slice(9)
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'args.json'), JSON.stringify({ args, deployCodegen: process.env.PIKKU_DEPLOY_CODEGEN }))
`
  )
  return bin
}

describe('generateBackendCodegen', () => {
  test('no backends writes no .pikku/backends tree and runs nothing', async (t) => {
    if (pathsAreBroken()) return t.skip('node:path is mocked as win32')
    const root = await mkdtemp(`${tmpdir()}/pikku-backends-`)
    dirs.push(root)
    assert.deepEqual(selectBackends(undefined), [])
    const { backendDirs, errors } = await generateBackendCodegen({
      projectDir: root,
      backends: selectBackends(undefined),
      inspectorState: getInitialInspectorState(root) as never,
      pikkuBin: await fakePikku(root),
    })
    assert.equal(backendDirs.size, 0)
    assert.deepEqual(errors, [])
    assert.equal(existsSync(join(root, '.pikku')), false)
  })

  test('--backend with no backends declared lists (none)', () => {
    assert.throws(
      () => selectBackends(undefined, 'api'),
      /Declared backends: \(none\)/
    )
    assert.throws(() => parseCLIFilters({}, {}, 'api'), /\(none\)/)
  })

  test('two backends sharing a function each get their own filtered tree', async (t) => {
    if (pathsAreBroken()) return t.skip('node:path is mocked as win32')
    const root = await mkdtemp(`${tmpdir()}/pikku-backends-`)
    dirs.push(root)
    const config = {
      backends: {
        api: { filter: { tags: ['api', 'shared'] } },
        jobs: { filter: { tags: ['jobs', 'shared'] } },
      },
    }

    // Both backends' filters carry the function tagged `shared`.
    assert.ok(parseCLIFilters({}, config, 'api').tags?.includes('shared'))
    assert.ok(parseCLIFilters({}, config, 'jobs').tags?.includes('shared'))

    const { backendDirs, errors } = await generateBackendCodegen({
      projectDir: root,
      backends: selectBackends(config.backends),
      inspectorState: getInitialInspectorState(root) as never,
      pikkuBin: await fakePikku(root),
    })

    assert.deepEqual(errors, [])
    assert.equal(
      backendDirs.get('api'),
      join(root, '.pikku', 'backends', 'api')
    )
    assert.equal(
      backendDirs.get('jobs'),
      join(root, '.pikku', 'backends', 'jobs')
    )
    for (const name of ['api', 'jobs']) {
      const written = JSON.parse(
        await readFile(
          join(root, '.pikku', 'backends', name, 'args.json'),
          'utf-8'
        )
      )
      assert.ok(written.args.includes(`--backend=${name}`))
      assert.equal(written.deployCodegen, '1')
    }
  })

  test('--backend narrows the run to the one backend', async (t) => {
    if (pathsAreBroken()) return t.skip('node:path is mocked as win32')
    const root = await mkdtemp(`${tmpdir()}/pikku-backends-`)
    dirs.push(root)
    const declared = { api: {}, jobs: {} }

    assert.deepEqual(selectBackends(declared, 'jobs'), ['jobs'])
    assert.throws(() => selectBackends(declared, 'nope'), /Unknown --backend/)

    const { backendDirs } = await generateBackendCodegen({
      projectDir: root,
      backends: selectBackends(declared, 'jobs'),
      inspectorState: getInitialInspectorState(root) as never,
      pikkuBin: await fakePikku(root),
    })
    assert.deepEqual([...backendDirs.keys()], ['jobs'])
  })

  test('a child that fails is reported against its backend', async (t) => {
    if (pathsAreBroken()) return t.skip('node:path is mocked as win32')
    const root = await mkdtemp(`${tmpdir()}/pikku-backends-`)
    dirs.push(root)
    const bin = join(root, 'bad.mjs')
    await writeFile(bin, 'process.exit(1)\n')
    const { errors } = await generateBackendCodegen({
      projectDir: root,
      backends: ['api'],
      inspectorState: getInitialInspectorState(root) as never,
      pikkuBin: bin,
    })
    assert.equal(errors[0]?.backend, 'api')
  })
})

describe('content buckets per backend', () => {
  test('two backends with different buckets get different generated types', async (t) => {
    if (pathsAreBroken()) return t.skip('node:path is mocked as win32')
    const root = await mkdtemp(`${tmpdir()}/pikku-backends-`)
    dirs.push(root)
    const { errors } = await generateBackendCodegen({
      projectDir: root,
      backends: ['api', 'jobs', 'bare'],
      contentBuckets: { api: ['photos', 'docs'], jobs: ['ingest'] },
      inspectorState: getInitialInspectorState(root) as never,
      pikkuBin: await fakePikku(root),
    })
    assert.deepEqual(errors, [])
    const read = (name: string) =>
      readFile(
        join(root, '.pikku', 'backends', name, 'content-buckets.gen.ts'),
        'utf-8'
      )
    const [api, jobs, bare] = await Promise.all([
      read('api'),
      read('jobs'),
      read('bare'),
    ])
    assert.match(api, /export type ContentBucket = "photos" \| "docs"/)
    assert.match(jobs, /export type ContentBucket = "ingest"\n/)
    assert.match(bare, /export type ContentBucket = never\n/)
    assert.match(api, /contentBuckets = \["photos","docs"\]/)
  })
})
