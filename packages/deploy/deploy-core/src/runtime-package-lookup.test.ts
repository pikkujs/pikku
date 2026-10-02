import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPackageLookup } from './runtime-package-lookup.js'
import type { CloudSupportData } from './cloudsupport.js'

const support: CloudSupportData = {
  schemaVersion: 1,
  packages: {
    lib: [
      {
        versions: '>=1',
        cloud: { edge: ['cloudflare-workers'], serverless: true },
        exports: { './dev': { cloud: { edge: false, serverless: false } } },
      },
    ],
    old: [{ versions: '<1', cloud: { edge: false, serverless: true } }],
  },
}

describe('createPackageLookup', () => {
  let dir: string
  const install = async (name: string, pkg: Record<string, unknown>) => {
    const root = join(dir, 'node_modules', name)
    await mkdir(join(root, 'dist'), { recursive: true })
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name, ...pkg })
    )
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pikku-lookup-'))
    await install('lib', {
      version: '1.2.3',
      exports: { '.': './dist/index.js', './dev': './dist/dev.js' },
    })
    await install('old', { version: '2.0.0' })
    await install('plain', { version: '1.0.0' })
    await install('claims', {
      version: '1.0.0',
      // Not read: tiers come from cloudsupport only.
      pikku: { runtime: 'edge' },
    })
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const lookup = () => createPackageLookup(dir, undefined, support)

  it('resolves the owning package and its subpath override', () => {
    const index = lookup()('node_modules/lib/dist/index.js')
    assert.equal(index?.tier.tier, 'edge')
    assert.equal(index?.declaredIn, 'cloudsupport lib@>=1')
    const dev = lookup()('node_modules/lib/dist/dev.js')
    assert.equal(dev?.tier.tier, 'server')
    assert.equal(dev?.tier.matchedSubpath, './dev')
  })

  it('treats a package cloudsupport does not list as undeclared serverless', () => {
    const r = lookup()('node_modules/plain/index.js')
    assert.deepEqual(
      [r?.name, r?.tier.tier, r?.tier.declared],
      ['plain', 'serverless', false]
    )
  })

  it('treats an installed version outside every range as undeclared', () => {
    assert.equal(lookup()('node_modules/old/index.js')?.tier.declared, false)
  })

  it('ignores a "pikku" block in package.json', () => {
    const r = lookup()('node_modules/claims/index.js')
    assert.deepEqual([r?.tier.tier, r?.tier.declared], ['serverless', false])
  })
})
