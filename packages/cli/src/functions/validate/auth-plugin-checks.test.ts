import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { runAuthPluginChecks } from './auth-plugin-checks.js'

const makeTmp = async () => mkdtemp(join(tmpdir(), 'pikku-auth-plugin-checks-'))

const config = { srcDirectories: ['packages/functions/src'] }

const writeSource = async (
  root: string,
  name: string,
  contents: string
): Promise<void> => {
  const dir = join(root, 'packages', 'functions', 'src')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), contents, 'utf8')
}

const AUTH_WITH_BAN = [
  "import { pikkuBetterAuth, ban } from '@pikku/better-auth'",
  "import { betterAuth } from 'better-auth'",
  'export const auth = pikkuBetterAuth(() =>',
  '  betterAuth({ plugins: [ban()] })',
  ')',
].join('\n')

const AUTH_WITH_ADMIN = [
  "import { pikkuBetterAuth } from '@pikku/better-auth'",
  "import { betterAuth } from 'better-auth'",
  "import { admin, bearer } from 'better-auth/plugins'",
  'export const auth = pikkuBetterAuth(() =>',
  '  betterAuth({ plugins: [bearer(), admin()] })',
  ')',
].join('\n')

const AUTH_WITHOUT_BAN = [
  "import { pikkuBetterAuth } from '@pikku/better-auth'",
  "import { betterAuth } from 'better-auth'",
  "import { bearer } from 'better-auth/plugins'",
  'export const auth = pikkuBetterAuth(() =>',
  '  betterAuth({ plugins: [bearer()] })',
  ')',
].join('\n')

describe('runAuthPluginChecks', () => {
  test('errors when better-auth admin() is wired', async () => {
    const root = await makeTmp()
    try {
      await writeSource(root, 'auth.ts', AUTH_WITH_ADMIN)
      const findings = await runAuthPluginChecks(root, config)
      const admin = findings.find((f) => f.id === 'better-auth-admin-plugin')
      assert.ok(admin, 'admin() must be reported')
      assert.equal(admin.severity, 'error')
      assert.match(admin.fixHint, /ban\(\)/)
      assert.match(admin.path, /auth\.ts$/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('warns when better-auth is configured with no ban()', async () => {
    const root = await makeTmp()
    try {
      await writeSource(root, 'auth.ts', AUTH_WITHOUT_BAN)
      const findings = await runAuthPluginChecks(root, config)
      const missing = findings.find((f) => f.id === 'better-auth-no-ban-plugin')
      assert.ok(missing, 'a missing ban() must be reported')
      assert.equal(missing.severity, 'warn')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('is silent when ban() is wired', async () => {
    const root = await makeTmp()
    try {
      await writeSource(root, 'auth.ts', AUTH_WITH_BAN)
      assert.deepEqual(await runAuthPluginChecks(root, config), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('reports admin() only, not a missing ban(), when both apply', async () => {
    const root = await makeTmp()
    try {
      await writeSource(root, 'auth.ts', AUTH_WITH_ADMIN)
      const ids = (await runAuthPluginChecks(root, config)).map((f) => f.id)
      assert.deepEqual(ids, ['better-auth-admin-plugin'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('ignores a local helper named admin', async () => {
    const root = await makeTmp()
    try {
      await writeSource(
        root,
        'auth.ts',
        [
          "import { pikkuBetterAuth, ban } from '@pikku/better-auth'",
          "import { betterAuth } from 'better-auth'",
          "import { admin } from './my-helpers.js'",
          'export const auth = pikkuBetterAuth(() =>',
          '  betterAuth({ plugins: [ban()] })',
          ')',
          'admin()',
        ].join('\n')
      )
      assert.deepEqual(await runAuthPluginChecks(root, config), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('catches admin() reached through a namespace import', async () => {
    const root = await makeTmp()
    try {
      await writeSource(
        root,
        'auth.ts',
        [
          "import { pikkuBetterAuth } from '@pikku/better-auth'",
          "import { betterAuth } from 'better-auth'",
          "import * as plugins from 'better-auth/plugins'",
          'export const auth = pikkuBetterAuth(() =>',
          '  betterAuth({ plugins: [plugins.admin()] })',
          ')',
        ].join('\n')
      )
      const ids = (await runAuthPluginChecks(root, config)).map((f) => f.id)
      assert.deepEqual(ids, ['better-auth-admin-plugin'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('ignores an admin import the plugins array no longer uses', async () => {
    const root = await makeTmp()
    try {
      await writeSource(
        root,
        'auth.ts',
        [
          "import { pikkuBetterAuth, ban } from '@pikku/better-auth'",
          "import { betterAuth } from 'better-auth'",
          "import { admin } from 'better-auth/plugins'",
          'export const auth = pikkuBetterAuth(() =>',
          '  betterAuth({ plugins: [ban()] })',
          ')',
        ].join('\n')
      )
      assert.deepEqual(await runAuthPluginChecks(root, config), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('does not count a ban() call outside the plugins array', async () => {
    const root = await makeTmp()
    try {
      await writeSource(
        root,
        'auth.ts',
        [
          "import { pikkuBetterAuth, ban } from '@pikku/better-auth'",
          "import { betterAuth } from 'better-auth'",
          "import { bearer } from 'better-auth/plugins'",
          'export const auth = pikkuBetterAuth(() =>',
          '  betterAuth({ plugins: [bearer()] })',
          ')',
          'void ban()',
        ].join('\n')
      )
      const ids = (await runAuthPluginChecks(root, config)).map((f) => f.id)
      assert.deepEqual(ids, ['better-auth-no-ban-plugin'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('says nothing about an app that does not configure better-auth', async () => {
    const root = await makeTmp()
    try {
      await writeSource(root, 'todo.function.ts', 'export const noop = 1')
      assert.deepEqual(await runAuthPluginChecks(root, config), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
