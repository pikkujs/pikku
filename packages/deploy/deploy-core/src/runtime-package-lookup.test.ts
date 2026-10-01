import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPackageLookup } from './runtime-package-lookup.js'

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
})
