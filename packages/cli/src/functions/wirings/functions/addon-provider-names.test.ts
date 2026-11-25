import { test, describe, afterEach } from 'node:test'
import * as assert from 'assert'
import { join } from 'path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { addonProviderNames } from './addon-provider-names.js'

const scratchRoot = () => {
  const dir = join(import.meta.dir, '../../../..', '.tmp')
  mkdirSync(dir, { recursive: true })
  return dir
}

const dirs: string[] = []

const project = (
  installed: Record<string, Record<string, unknown> | 'broken' | 'no-meta'>
) => {
  const root = mkdtempSync(join(scratchRoot(), 'pikku-addon-services-'))
  dirs.push(root)
  writeFileSync(join(root, 'package.json'), '{"name":"app"}')
  for (const [name, meta] of Object.entries(installed)) {
    const dir = join(root, 'node_modules', name)
    mkdirSync(join(dir, '.pikku', 'providers'), { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        exports: { './.pikku/*': './.pikku/*' },
      })
    )
    if (meta === 'no-meta') continue
    writeFileSync(
      join(dir, '.pikku', 'providers', 'pikku-providers-meta.gen.json'),
      meta === 'broken'
        ? '{nope'
        : JSON.stringify({ metaVersion: 2, providers: meta, collections: {} })
    )
  }
  return root
}

const state = (
  rootDir: string,
  declarations: Record<string, { package: string; remote?: boolean }>
) =>
  ({
    rootDir,
    rpc: { wireAddonDeclarations: new Map(Object.entries(declarations)) },
  }) as never

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('addonProviderNames', () => {
  test('lists the names an installed addon registers, by package', () => {
    const root = project({
      '@scope/mail': { mailer: {}, 'audit-log': {} },
    })
    assert.deepStrictEqual(
      addonProviderNames(state(root, { mail: { package: '@scope/mail' } })),
      { '@scope/mail': ['mailer', 'audit-log'] }
    )
  })

  test('a package wired under two namespaces is listed once', () => {
    const root = project({ '@scope/mail': { mailer: {} } })
    assert.deepStrictEqual(
      addonProviderNames(
        state(root, {
          a: { package: '@scope/mail' },
          b: { package: '@scope/mail' },
        })
      ),
      { '@scope/mail': ['mailer'] }
    )
  })

  test('leaves out a remote addon, a missing meta and an unreadable one', () => {
    const root = project({
      '@scope/broken': 'broken',
      '@scope/bare': 'no-meta',
    })
    assert.deepStrictEqual(
      addonProviderNames(
        state(root, {
          far: { package: '@scope/far', remote: true },
          gone: { package: '@scope/not-installed' },
          broken: { package: '@scope/broken' },
          bare: { package: '@scope/bare' },
        })
      ),
      {}
    )
  })
})
