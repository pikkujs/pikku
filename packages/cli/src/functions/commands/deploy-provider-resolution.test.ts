import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveProvider } from './deploy-apply.js'

// A deploy provider is a dependency of the user's project, not of the CLI —
// that is what the "is not installed" error tells them to fix. Yarn's hoisted
// root made a bare `import(packageName)` from inside the CLI find it anyway;
// bun's isolated layout gives the CLI only what the CLI itself declares, so the
// provider has to be resolved against the project being deployed.
const writeFakeProvider = (rootDir: string) => {
  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({ name: 'consumer', type: 'module' })
  )
  const providerDir = join(rootDir, 'node_modules', '@pikku', 'deploy-fake')
  mkdirSync(providerDir, { recursive: true })
  writeFileSync(
    join(providerDir, 'package.json'),
    JSON.stringify({
      name: '@pikku/deploy-fake',
      version: '0.0.0',
      type: 'module',
      main: 'index.js',
    })
  )
  writeFileSync(
    join(providerDir, 'index.js'),
    `export const createAdapter = (options) => ({ name: 'fake', options })\n`
  )
}

describe('resolveProvider resolves the adapter from the project, not the CLI', () => {
  test('loads a provider installed only in the project being deployed', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-deploy-provider-'))
    try {
      writeFakeProvider(rootDir)

      const adapter = await resolveProvider(
        { deploy: { providers: { fake: '@pikku/deploy-fake' } } },
        'fake',
        { projectDir: rootDir }
      )

      assert.equal((adapter as unknown as { name: string }).name, 'fake')
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('names the package the project is missing', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-deploy-provider-'))
    try {
      writeFileSync(
        join(rootDir, 'package.json'),
        JSON.stringify({ name: 'consumer' })
      )

      await assert.rejects(
        resolveProvider(
          { deploy: { providers: { fake: '@pikku/deploy-absent' } } },
          'fake',
          { projectDir: rootDir }
        ),
        /@pikku\/deploy-absent' is not installed/
      )
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
