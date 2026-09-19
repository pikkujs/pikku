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

// An ESM-only provider: its exports map carries `types` and `import` and no
// `require`, which is an ordinary way to publish and is exactly what
// `require.resolve` refuses to resolve.
const writeEsmOnlyProvider = (rootDir: string, exportsMap: unknown) => {
  writeFileSync(
    join(rootDir, 'package.json'),
    JSON.stringify({ name: 'consumer', type: 'module' })
  )
  const providerDir = join(rootDir, 'node_modules', '@vendor', 'deploy-esm')
  mkdirSync(join(providerDir, 'dist'), { recursive: true })
  writeFileSync(
    join(providerDir, 'package.json'),
    JSON.stringify({
      name: '@vendor/deploy-esm',
      version: '0.0.0',
      type: 'module',
      main: 'dist/index.js',
      exports: exportsMap,
    })
  )
  writeFileSync(
    join(providerDir, 'dist', 'index.js'),
    `export const createAdapter = (options) => ({ name: 'esm-only', options })\n`
  )
  // Two more builds, so a test about which condition won can name the winner
  // rather than merely assert that something loaded.
  writeFileSync(
    join(providerDir, 'dist', 'node.js'),
    `export const createAdapter = (options) => ({ name: 'node-build', options })\n`
  )
  writeFileSync(
    join(providerDir, 'dist', 'browser.js'),
    `export const createAdapter = (options) => ({ name: 'browser-build', options })\n`
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

  test('loads a provider whose exports map has no require condition', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-deploy-provider-'))
    try {
      writeEsmOnlyProvider(rootDir, {
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      })

      const adapter = await resolveProvider(
        { deploy: { providers: { esm: '@vendor/deploy-esm' } } },
        'esm',
        { projectDir: rootDir }
      )

      assert.equal((adapter as unknown as { name: string }).name, 'esm-only')
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('loads a provider whose import condition nests a default', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-deploy-provider-'))
    try {
      writeEsmOnlyProvider(rootDir, {
        '.': { import: { default: './dist/index.js' } },
      })

      const adapter = await resolveProvider(
        { deploy: { providers: { esm: '@vendor/deploy-esm' } } },
        'esm',
        { projectDir: rootDir }
      )

      assert.equal((adapter as unknown as { name: string }).name, 'esm-only')
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  // A provider that ships both builds is resolved the way node would resolve
  // it: `node` is listed first and is true here, so the browser build is never
  // reached. Picking conditions off a fixed preference list instead loaded the
  // browser build and left the deploy adapter without the node APIs it uses.
  test('prefers a nested node condition over the default beside it', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-deploy-provider-'))
    try {
      writeEsmOnlyProvider(rootDir, {
        '.': {
          import: { node: './dist/node.js', default: './dist/browser.js' },
        },
      })

      const adapter = await resolveProvider(
        { deploy: { providers: { esm: '@vendor/deploy-esm' } } },
        'esm',
        { projectDir: rootDir }
      )

      assert.equal((adapter as unknown as { name: string }).name, 'node-build')
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  // The order is the package author's, not ours: `default` matches everything,
  // so a map that lists it first has said the later conditions are unreachable.
  test('honours declaration order when default is listed first', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-deploy-provider-'))
    try {
      writeEsmOnlyProvider(rootDir, {
        '.': { default: './dist/browser.js', node: './dist/node.js' },
      })

      const adapter = await resolveProvider(
        { deploy: { providers: { esm: '@vendor/deploy-esm' } } },
        'esm',
        { projectDir: rootDir }
      )

      assert.equal(
        (adapter as unknown as { name: string }).name,
        'browser-build'
      )
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  // An array is a list of fallbacks and `null` is a deliberate block, so the
  // walk carries on past both rather than stopping at the first miss.
  test('walks past a blocked target to the next fallback', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-deploy-provider-'))
    try {
      writeEsmOnlyProvider(rootDir, {
        '.': { import: [null, './dist/index.js'] },
      })

      const adapter = await resolveProvider(
        { deploy: { providers: { esm: '@vendor/deploy-esm' } } },
        'esm',
        { projectDir: rootDir }
      )

      assert.equal((adapter as unknown as { name: string }).name, 'esm-only')
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('still reports an absent package rather than the exports failure', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'pikku-deploy-provider-'))
    try {
      writeEsmOnlyProvider(rootDir, { './other': './dist/index.js' })

      await assert.rejects(
        resolveProvider(
          { deploy: { providers: { esm: '@vendor/deploy-esm' } } },
          'esm',
          { projectDir: rootDir }
        ),
        /@vendor\/deploy-esm' is not installed/
      )
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
