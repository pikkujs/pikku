import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPackageLookup } from './runtime-package-lookup.js'
import type { CloudSupportData } from './cloudsupport.js'

describe('createPackageLookup', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pikku-lookup-'))
    const pkg = join(dir, 'node_modules', 'lib')
    await mkdir(join(pkg, 'dist'), { recursive: true })
    await writeFile(
      join(pkg, 'package.json'),
      JSON.stringify({
        name: 'lib',
        exports: { '.': './dist/index.js', './dev': './dist/dev.js' },
        pikku: { runtime: 'edge', exports: { './dev': 'server' } },
      })
    )
    const bad = join(dir, 'node_modules', 'bad')
    await mkdir(bad, { recursive: true })
    await writeFile(
      join(bad, 'package.json'),
      JSON.stringify({ name: 'bad', pikku: { runtime: 'cloud' } })
    )
    const plain = join(dir, 'node_modules', 'plain')
    await mkdir(plain, { recursive: true })
    await writeFile(
      join(plain, 'package.json'),
      JSON.stringify({ name: 'plain' })
    )
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('resolves the owning package and its subpath override', () => {
    const lookup = createPackageLookup(dir)
    assert.equal(lookup('node_modules/lib/dist/index.js')?.tier.tier, 'edge')
    const dev = lookup('node_modules/lib/dist/dev.js')
    assert.equal(dev?.tier.tier, 'server')
    assert.equal(dev?.tier.matchedSubpath, './dev')
  })

  it('treats a package with no declaration as undeclared server', () => {
    const r = createPackageLookup(dir)('node_modules/plain/index.js')
    assert.deepEqual(
      [r?.name, r?.tier.tier, r?.tier.declared],
      ['plain', 'server', false]
    )
  })

  it('throws on an invalid declaration instead of defaulting', () => {
    assert.throws(
      () => createPackageLookup(dir)('node_modules/bad/index.js'),
      /Invalid "pikku" runtime declaration/
    )
  })

  describe('with cloudsupport data', () => {
    const support = (
      versions: string,
      edge: false | string[],
      serverless: boolean
    ): CloudSupportData => ({
      schemaVersion: 1,
      packages: { lib: [{ versions, cloud: { edge, serverless } }] },
    })

    const write = async (version: string) =>
      writeFile(
        join(dir, 'node_modules', 'lib', 'package.json'),
        JSON.stringify({
          name: 'lib',
          version,
          exports: { '.': './dist/index.js', './dev': './dist/dev.js' },
          // Would say edge for everything; the data must win.
          pikku: { runtime: 'edge' },
        })
      )

    it('takes the tier from the data over the package.json block', async () => {
      await write('1.2.3')
      const r = createPackageLookup(
        dir,
        undefined,
        support('>=1', false, true)
      )('node_modules/lib/dist/index.js')
      assert.equal(r?.tier.tier, 'serverless')
      assert.equal(r?.declaredIn, 'cloudsupport lib@>=1')
    })

    it('falls back to the package.json block when no range matches', async () => {
      await write('0.5.0')
      const r = createPackageLookup(
        dir,
        undefined,
        support('>=1', false, true)
      )('node_modules/lib/dist/index.js')
      assert.equal(r?.tier.tier, 'edge')
      assert.ok(r?.declaredIn?.endsWith('package.json'))
    })

    it('ignores an invalid package.json block when the data covers it', async () => {
      await writeFile(
        join(dir, 'node_modules', 'lib', 'package.json'),
        JSON.stringify({
          name: 'lib',
          version: '1.0.0',
          pikku: { runtime: 'cloud' },
        })
      )
      const r = createPackageLookup(
        dir,
        undefined,
        support('*', false, false)
      )('node_modules/lib/dist/index.js')
      assert.equal(r?.tier.tier, 'server')
      assert.equal(r?.tier.declared, true)
    })
  })
})
