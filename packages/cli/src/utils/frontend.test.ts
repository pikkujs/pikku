import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'

import {
  assertFrontendBuilt,
  nativeSidecars,
  servedFrontend,
} from './frontend.js'

describe('assertFrontendBuilt', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const scratch = async () => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-fe-built-'))
    tempDirs.push(root)
    return root
  }

  test('accepts a directory holding a built shell', async () => {
    const dir = await scratch()
    await writeFile(join(dir, 'index.html'), '<!doctype html>')

    await assertFrontendBuilt(dir)
  })

  test('names the directory it looked in when nothing was built', async () => {
    const dir = join(await scratch(), 'never-built')

    await assert.rejects(
      () => assertFrontendBuilt(dir),
      (error: Error) => error.message.includes(dir)
    )
  })

  test('says the build has to run first rather than blaming the config', async () => {
    // The whole point of the `frontend` key is that pikku reads output it did
    // not produce, so the fix is always to run the frontend's own build.
    const dir = await scratch()
    await mkdir(join(dir, 'assets'), { recursive: true })

    await assert.rejects(() => assertFrontendBuilt(dir), /never builds it/)
  })
})

describe('servedFrontend', () => {
  test('picks the frontend that sets serve', () => {
    assert.deepEqual(
      servedFrontend({
        admin: { cwd: '/p/admin', dist: '/p/admin/dist' },
        web: {
          cwd: '/p/web',
          dist: '/p/web/dist',
          serve: { urlPrefix: '/', spaFallback: true },
        },
      }),
      { name: 'web', dir: '/p/web/dist', urlPrefix: '/', spaFallback: true }
    )
  })

  test('is undefined when nothing is served', () => {
    assert.equal(
      servedFrontend({ web: { cwd: '/p/web', dist: '/p/web/dist' } }),
      undefined
    )
    assert.equal(servedFrontend(undefined), undefined)
  })
})

describe('nativeSidecars', () => {
  test('lists the native projects that bundle the server, and only those', () => {
    assert.deepEqual(
      nativeSidecars({
        desk: {
          cwd: '/p/desk',
          dist: '/p/desk/dist',
          native: {
            identifier: 'com.acme.desk',
            platforms: ['desktop'],
            bundleServer: true,
          },
        },
        phone: {
          cwd: '/p/phone',
          dist: '/p/phone/dist',
          native: { identifier: 'com.acme.phone', platforms: ['android'] },
        },
      }),
      [{ name: 'desk', dir: '/p/desk/src-tauri' }]
    )
  })
})
