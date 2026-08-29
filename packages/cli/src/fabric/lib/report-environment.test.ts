import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  collectReportEnvironment,
  detectPackageManager,
  findPikkuScope,
  readPikkuPackages,
} from './report-environment.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'pikku-report-env-'))
}

async function installPackage(
  scope: string,
  name: string,
  version: string
): Promise<string> {
  const dir = join(scope, name)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: `@pikku/${name}`, version })
  )
  return dir
}

describe('readPikkuPackages', () => {
  test('reads the installed version, not the declared range', async () => {
    const root = await makeTmp()
    try {
      const scope = join(root, 'node_modules', '@pikku')
      await installPackage(scope, 'core', '0.12.90')
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ dependencies: { '@pikku/core': '^0.12.35' } })
      )

      const packages = await readPikkuPackages(scope)

      assert.deepEqual(packages, [
        { name: '@pikku/core', version: '0.12.90', linked: false },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('flags a package that resolves through a symlink', async () => {
    const root = await makeTmp()
    try {
      const scope = join(root, 'node_modules', '@pikku')
      await mkdir(scope, { recursive: true })
      const checkout = await installPackage(
        join(root, 'checkouts'),
        'core',
        '0.13.0-dev'
      )
      await symlink(checkout, join(scope, 'core'))

      const [core] = await readPikkuPackages(scope)

      assert.equal(core.linked, true)
      assert.equal(core.version, '0.13.0-dev')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('skips an entry whose manifest is unreadable or unparseable', async () => {
    const root = await makeTmp()
    try {
      const scope = join(root, 'node_modules', '@pikku')
      await installPackage(scope, 'core', '0.12.90')
      await mkdir(join(scope, 'empty'), { recursive: true })
      await mkdir(join(scope, 'broken'), { recursive: true })
      await writeFile(join(scope, 'broken', 'package.json'), '{ not json')

      const packages = await readPikkuPackages(scope)

      assert.deepEqual(
        packages.map((p) => p.name),
        ['@pikku/core']
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('findPikkuScope', () => {
  test('walks up to the hoisted scope from a nested app', async () => {
    const root = await makeTmp()
    try {
      const scope = join(root, 'node_modules', '@pikku')
      await installPackage(scope, 'core', '0.12.90')
      const app = join(root, 'apps', 'web')
      await mkdir(app, { recursive: true })

      assert.equal(await findPikkuScope(app), scope)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('ignores an empty scope directory and keeps walking', async () => {
    const root = await makeTmp()
    try {
      const hoisted = join(root, 'node_modules', '@pikku')
      await installPackage(hoisted, 'core', '0.12.90')
      const app = join(root, 'apps', 'web')
      await mkdir(join(app, 'node_modules', '@pikku'), { recursive: true })

      assert.equal(await findPikkuScope(app), hoisted)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('detectPackageManager', () => {
  test('prefers a declared packageManager over the lockfile', async () => {
    const root = await makeTmp()
    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ packageManager: 'yarn@4.1.0' })
      )
      await writeFile(join(root, 'package-lock.json'), '{}')

      assert.equal(await detectPackageManager(root), 'yarn@4.1.0')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('falls back to the lockfile when nothing is declared', async () => {
    const root = await makeTmp()
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({}))
      await writeFile(join(root, 'pnpm-lock.yaml'), '')

      assert.equal(await detectPackageManager(root), 'pnpm')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('collectReportEnvironment', () => {
  test('flags a skewed tree — the CLI pinned, its dependencies not', async () => {
    const root = await makeTmp()
    try {
      const scope = join(root, 'node_modules', '@pikku')
      await installPackage(scope, 'cli', '0.12.35')
      await installPackage(scope, 'core', '0.12.90')

      const env = await collectReportEnvironment(root)

      assert.equal(env.versionSkew, true)
      assert.equal(env.linkedFramework, false)
      assert.deepEqual(
        env.packages.map((p) => `${p.name}@${p.version}`),
        ['@pikku/cli@0.12.35', '@pikku/core@0.12.90']
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a uniform tree is not skewed', async () => {
    const root = await makeTmp()
    try {
      const scope = join(root, 'node_modules', '@pikku')
      await installPackage(scope, 'cli', '0.12.90')
      await installPackage(scope, 'core', '0.12.90')

      const env = await collectReportEnvironment(root)

      assert.equal(env.versionSkew, false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('reports an empty package list rather than throwing when nothing is installed', async () => {
    const root = await makeTmp()
    try {
      const env = await collectReportEnvironment(root)

      assert.deepEqual(env.packages, [])
      assert.equal(env.versionSkew, false)
      assert.equal(env.linkedFramework, false)
      assert.equal(env.node, process.version)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
