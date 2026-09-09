import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type * as Pg from 'pg'

import {
  cjsInterop,
  importFromProject,
  resolveFromProject,
} from './resolve-from-project.js'

/**
 * The CLI package root — a real project with `pg` installed. `pg` stands in for
 * the `ws` the interop exists for: it is the same CJS shape, and unlike `ws` it
 * is not a module bun implements itself and resolves to a bare specifier.
 */
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('resolveFromProject', () => {
  test('resolves a package installed for the project', () => {
    assert.match(resolveFromProject(projectRoot, 'pg') ?? '', /[\\/]pg[\\/]/)
  })

  test('is undefined for a package the project does not have', () => {
    assert.equal(
      resolveFromProject(projectRoot, '@pikku/not-a-real-package'),
      undefined
    )
  })

  test('is undefined for a directory that is not a project', () => {
    assert.equal(resolveFromProject('/nowhere-at-all', 'pg'), undefined)
  })
})

describe('importFromProject', () => {
  test('is undefined rather than throwing when nothing resolves', async () => {
    assert.equal(
      await importFromProject(projectRoot, '@pikku/not-a-real-package'),
      undefined
    )
  })
})

describe('cjsInterop', () => {
  test('reaches the named exports of a CJS package imported by path', async () => {
    const pg = await importFromProject<typeof Pg & { default?: typeof Pg }>(
      projectRoot,
      'pg'
    )
    assert.ok(pg, 'pg should resolve from the CLI package')

    // The shape this interop exists for: imported by absolute path, a CJS
    // package comes back carrying `default`. If Node ever starts reconstructing
    // the named exports too, the interop stays correct and this says so.
    assert.ok('default' in pg)

    const resolved = cjsInterop(pg, 'Client')
    assert.equal(typeof resolved.Client, 'function')
  })

  test('leaves a namespace that already has the export alone', () => {
    const mod = {
      Client: 'named',
      default: { Client: 'cjs' },
    }
    assert.equal(cjsInterop(mod, 'Client').Client, 'named')
  })

  test('falls back to the namespace when there is no default either', () => {
    const mod = { other: 1 } as { other: number; default?: { other: number } }
    assert.equal(cjsInterop(mod, 'other').other, 1)
  })
})
