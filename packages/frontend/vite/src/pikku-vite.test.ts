import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import { pikkuVite } from './pikku-vite.js'
import { readPikkuViteProject } from './pikku-config.js'

const roots: string[] = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/** A project with a frontend in `apps/app`, optionally with the Better Auth wiring generated. */
const project = (config: object, options: { betterAuth: boolean }) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-vite-'))
  roots.push(root)
  writeFileSync(join(root, 'pikku.config.json'), JSON.stringify(config))
  mkdirSync(join(root, 'apps/app'), { recursive: true })
  if (options.betterAuth) {
    mkdirSync(join(root, 'packages/functions/src/scaffold/auth'), {
      recursive: true,
    })
    writeFileSync(
      join(root, 'packages/functions/src/scaffold/auth/auth.gen.ts'),
      ''
    )
  }
  return join(root, 'apps/app')
}

const config = {
  rootDir: '.',
  srcDirectories: ['packages/functions/src'],
  clientFiles: { envFile: 'apps/app/src/pikku/env.gen.ts' },
}

const names = async (from: string) => {
  const resolved = await Promise.all(pikkuVite({ from }))
  return resolved.flat().map((p) => (p as { name: string }).name)
}

describe('pikkuVite', () => {
  test('always applies the test ids', async () => {
    assert.deepEqual(await names(project(config, { betterAuth: false })), [
      'pikku:testids',
    ])
  })

  test('adds the cross-site session relay when the project uses Better Auth', async () => {
    assert.deepEqual(await names(project(config, { betterAuth: true })), [
      'pikku:testids',
      'pikku:cross-site-session',
    ])
  })

  test('honours scaffold.pikkuDir when finding the Better Auth wiring', async () => {
    const dir = project(
      { ...config, scaffold: { pikkuDir: 'packages/functions/src/scaffold' } },
      { betterAuth: true }
    )
    assert.equal(readPikkuViteProject(dir)?.betterAuth, true)
  })

  test('a directory with no pikku.config.json still gets the test ids', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pikku-vite-none-'))
    roots.push(root)
    assert.deepEqual(await names(root), ['pikku:testids'])
  })

  test('resolves the generated env file against the config directory', () => {
    const dir = project(config, { betterAuth: false })
    assert.equal(
      readPikkuViteProject(dir)?.envFile,
      join(dir, 'src/pikku/env.gen.ts')
    )
  })
})
