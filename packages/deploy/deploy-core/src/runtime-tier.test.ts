import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePackageTier,
  resolveUnitTier,
  subpathForFile,
  tierFitsWithin,
  weakestTier,
} from './runtime-tier.js'

describe('resolvePackageTier', () => {
  const declaration = {
    runtime: 'edge' as const,
    exports: {
      './dev': 'server' as const,
      './services/*': 'serverless' as const,
      './services/local-*': 'server' as const,
    },
  }

  it('defaults to serverless, undeclared', () => {
    assert.deepEqual(resolvePackageTier(undefined), {
      tier: 'serverless',
      declared: false,
      via: 'default',
    })
  })

  it('uses the package tier when no override matches', () => {
    assert.equal(resolvePackageTier(declaration, './http').tier, 'edge')
    assert.equal(resolvePackageTier(declaration).via, 'package')
  })

  it('applies an exact override', () => {
    const r = resolvePackageTier(declaration, './dev')
    assert.deepEqual(
      [r.tier, r.via, r.matchedSubpath],
      ['server', 'subpath', './dev']
    )
  })

  it('prefers the longer matching pattern', () => {
    assert.equal(
      resolvePackageTier(declaration, './services/db').tier,
      'serverless'
    )
    assert.equal(
      resolvePackageTier(declaration, './services/local-meta').tier,
      'server'
    )
  })
})

describe('tiers', () => {
  it('orders edge < serverless < server', () => {
    assert.ok(tierFitsWithin('edge', 'serverless'))
    assert.ok(tierFitsWithin('serverless', 'serverless'))
    assert.ok(!tierFitsWithin('serverless', 'edge'))
    assert.ok(!tierFitsWithin('server', 'serverless'))
  })

  it('weakestTier is the most demanding, edge when empty', () => {
    assert.equal(weakestTier([]), 'edge')
    assert.equal(weakestTier(['edge', 'serverless', 'edge']), 'serverless')
    assert.equal(weakestTier(['server', 'edge']), 'server')
  })
})

describe('resolveUnitTier', () => {
  it('is the weakest declared package, and names what limits it', () => {
    const r = resolveUnitTier([
      { name: '@pikku/core', tier: 'edge', declared: true },
      { name: 'better-auth', tier: 'serverless', declared: true },
      { name: '@pikku/better-auth', tier: 'serverless', declared: true },
    ])
    assert.equal(r.tier, 'serverless')
    assert.deepEqual(r.limitedBy, ['@pikku/better-auth', 'better-auth'])
  })

  it('does not count undeclared packages', () => {
    const r = resolveUnitTier([
      { name: 'zod', tier: 'server', declared: false },
      { name: '@pikku/core', tier: 'edge', declared: true },
    ])
    assert.equal(r.tier, 'edge')
  })
})

describe('subpathForFile', () => {
  const exportsField = {
    '.': { import: './dist/index.js', types: './dist/index.d.ts' },
    './dev': './dist/dev/hot-reload.js',
    './services/*': './dist/services/*.js',
  }
  it('finds an exact and a conditional target', () => {
    assert.equal(
      subpathForFile(exportsField, 'dist/dev/hot-reload.js'),
      './dev'
    )
    assert.equal(subpathForFile(exportsField, 'dist/index.js'), '.')
  })
  it('expands a star pattern', () => {
    assert.equal(
      subpathForFile(exportsField, 'dist/services/local.js'),
      './services/local'
    )
  })
  it('is undefined for an internal file', () => {
    assert.equal(subpathForFile(exportsField, 'dist/internal.js'), undefined)
  })
  it('handles a conditions-only exports object', () => {
    assert.equal(subpathForFile({ import: './a.js' }, 'a.js'), '.')
  })
})
