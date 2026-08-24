import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type * as Ws from 'ws'

import {
  cjsInterop,
  importFromProject,
  resolveFromProject,
} from './resolve-from-project.js'

/** The CLI package root — a real project with `ws` installed. */
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('resolveFromProject', () => {
  test('resolves a package installed for the project', () => {
    assert.match(resolveFromProject(projectRoot, 'ws') ?? '', /[\\/]ws[\\/]/)
  })

  test('is undefined for a package the project does not have', () => {
    assert.equal(
      resolveFromProject(projectRoot, '@pikku/not-a-real-package'),
      undefined
    )
  })

  test('is undefined for a directory that is not a project', () => {
    assert.equal(resolveFromProject('/nowhere-at-all', 'ws'), undefined)
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
    const ws = await importFromProject<typeof Ws & { default?: typeof Ws }>(
      projectRoot,
      'ws'
    )
    assert.ok(ws, 'ws should resolve from the CLI package')

    // The shape this interop exists for: imported by absolute path, `ws` comes
    // back with no named exports at all. If Node ever starts reconstructing
    // them, the interop stays correct and this assertion is what says so.
    assert.ok('default' in ws)

    const resolved = cjsInterop(ws, 'WebSocketServer')
    assert.equal(typeof resolved.WebSocketServer, 'function')
    const server = new resolved.WebSocketServer({ noServer: true })
    server.close()
  })

  test('leaves a namespace that already has the export alone', () => {
    const mod = {
      WebSocketServer: 'named',
      default: { WebSocketServer: 'cjs' },
    }
    assert.equal(cjsInterop(mod, 'WebSocketServer').WebSocketServer, 'named')
  })

  test('falls back to the namespace when there is no default either', () => {
    const mod = { other: 1 } as { other: number; default?: { other: number } }
    assert.equal(cjsInterop(mod, 'other').other, 1)
  })
})
