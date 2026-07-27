import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeProjectConfig } from './config.js'

const configName = 'pikkufabric.config.json'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'pikku-fabric-config-'))
}

async function readConfig(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, configName), 'utf8'))
}

/** Swallow the warn a rewrite prints so the test output stays readable. */
async function withoutWarnings<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.warn = warn
  }
}

describe('writeProjectConfig', () => {
  test('preserves frontends, production and unknown keys when relinking', async () => {
    const tmp = await makeTmp()
    try {
      await writeFile(
        join(tmp, configName),
        JSON.stringify({
          projectId: 'proj-old',
          apiUrl: 'https://api.example.com',
          frontends: { app: { cwd: 'apps/app', kind: 'ssr' } },
          production: { domain: 'example.com' },
          somethingWeDoNotUnderstand: { keep: true },
        }),
        'utf8'
      )

      await writeProjectConfig(tmp, { projectId: 'proj-new' })

      const config = await readConfig(tmp)
      assert.equal(config.projectId, 'proj-new')
      assert.equal(config.apiUrl, 'https://api.example.com')
      assert.deepEqual(config.frontends, {
        app: { cwd: 'apps/app', kind: 'ssr' },
      })
      assert.deepEqual(config.production, { domain: 'example.com' })
      assert.deepEqual(config.somethingWeDoNotUnderstand, { keep: true })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('applies a partial update without dropping the other keys', async () => {
    const tmp = await makeTmp()
    try {
      await writeFile(
        join(tmp, configName),
        JSON.stringify({
          projectId: 'proj-abc',
          apiUrl: 'https://api.example.com',
          frontends: { app: { cwd: 'apps/app' } },
        }),
        'utf8'
      )

      await writeProjectConfig(tmp, {
        projectId: 'proj-abc',
        apiUrl: 'http://localhost:4002',
      })

      const config = await readConfig(tmp)
      assert.equal(config.apiUrl, 'http://localhost:4002')
      assert.deepEqual(config.frontends, { app: { cwd: 'apps/app' } })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('writes a fresh config when none exists', async () => {
    const tmp = await makeTmp()
    try {
      const path = await writeProjectConfig(tmp, { projectId: 'proj-abc' })
      assert.equal(path, join(tmp, configName))
      assert.deepEqual(await readConfig(tmp), { projectId: 'proj-abc' })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('rewrites an unparseable config rather than failing the link', async () => {
    const tmp = await makeTmp()
    try {
      await writeFile(join(tmp, configName), '{ not json', 'utf8')

      await withoutWarnings(() =>
        writeProjectConfig(tmp, { projectId: 'proj-abc' })
      )

      assert.deepEqual(await readConfig(tmp), { projectId: 'proj-abc' })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('rewrites valid JSON that is not an object', async () => {
    const tmp = await makeTmp()
    try {
      await writeFile(join(tmp, configName), '["not", "a", "config"]', 'utf8')

      await withoutWarnings(() =>
        writeProjectConfig(tmp, { projectId: 'proj-abc' })
      )

      assert.deepEqual(await readConfig(tmp), { projectId: 'proj-abc' })
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('refuses to overwrite a config it could not read', async (t) => {
    if (process.getuid?.() === 0) {
      t.skip('root ignores file permissions')
      return
    }
    const tmp = await makeTmp()
    const path = join(tmp, configName)
    try {
      const original = JSON.stringify({
        projectId: 'proj-abc',
        frontends: { app: { cwd: 'apps/app' } },
      })
      await writeFile(path, original, 'utf8')
      await chmod(path, 0o000)

      await assert.rejects(
        writeProjectConfig(tmp, { projectId: 'proj-new' }),
        /refusing to overwrite/
      )

      await chmod(path, 0o600)
      assert.equal(await readFile(path, 'utf8'), original)
    } finally {
      await chmod(path, 0o600).catch((error) => {
        // Only affects cleanup of a temp dir we remove next; note it and move on.
        console.warn(`[test] could not restore ${path} mode: ${error.message}`)
      })
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
