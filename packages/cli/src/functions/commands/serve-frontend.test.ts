import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'

import { resolveFrontendMount } from './serve-frontend.js'

describe('resolveFrontendMount', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const builtFrontend = async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-frontend-'))
    tempDirs.push(root)
    const dir = join(root, 'dist')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, 'index.html'),
      '<!doctype html><title>app</title>'
    )
    return dir
  }

  test('mounts a built frontend at its configured prefix', async () => {
    const dir = await builtFrontend()

    assert.deepEqual(
      await resolveFrontendMount({
        dir,
        urlPrefix: '/',
        spaFallback: true,
      }),
      { urlPrefix: '/', directory: dir, spaFallback: true }
    )
  })

  test('carries spaFallback through untouched', async () => {
    const dir = await builtFrontend()

    const mount = await resolveFrontendMount({
      dir,
      urlPrefix: '/app',
      spaFallback: false,
    })

    assert.equal(mount.spaFallback, false)
    assert.equal(mount.urlPrefix, '/app')
  })

  test('names the directory when the frontend has not been built', async () => {
    // pikku serves output and never produces it, so an unbuilt directory is a
    // missing build step rather than something to paper over with a 404.
    const root = await mkdtemp(join(tmpdir(), 'pikku-frontend-'))
    tempDirs.push(root)
    const dir = join(root, 'dist')

    await assert.rejects(
      resolveFrontendMount({ dir, urlPrefix: '/', spaFallback: true }),
      (e: unknown) =>
        e instanceof Error &&
        e.message.includes(dir) &&
        /frontend/i.test(e.message)
    )
  })

  test('a directory without an index.html is not a built frontend', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-frontend-'))
    tempDirs.push(root)
    const dir = join(root, 'dist')
    await mkdir(dir, { recursive: true })

    await assert.rejects(
      resolveFrontendMount({ dir, urlPrefix: '/', spaFallback: true })
    )
  })
})
