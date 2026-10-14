import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { runVirtualUserChecks } from './virtual-user-checks.js'

const makeTmp = async () =>
  mkdtemp(join(tmpdir(), 'pikku-virtual-user-checks-'))

const config = {
  srcDirectories: ['packages/functions/src'],
  outDir: 'packages/functions/.pikku',
  environments: { local: { apiUrl: 'http://localhost:4002' } },
}

const srcDir = (root: string) => join(root, 'packages', 'functions', 'src')

const writeSource = async (
  root: string,
  name: string,
  contents: string
): Promise<void> => {
  await mkdir(srcDir(root), { recursive: true })
  await writeFile(join(srcDir(root), name), contents, 'utf8')
}

const writeVirtualUserMeta = async (
  root: string,
  meta: Record<string, unknown>
): Promise<void> => {
  const dir = join(root, 'packages', 'functions', '.pikku', 'scopes')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'pikku-virtual-users-meta.gen.json'),
    JSON.stringify(meta, null, 2),
    'utf8'
  )
}

const virtualUserWiring = [
  "import { pikkuVirtualUser } from '@pikku/better-auth'",
  'export const auth = () => ({ plugins: [pikkuVirtualUser({ secret: undefined })] })',
  '',
].join('\n')

// The name pikkuVirtualUser() shipped under before the plugins took a pikku prefix.
// The alias is still exported, so wiring it still counts as virtual user sign-in.
const deprecatedVirtualUserAliasWiring = [
  "import { virtualUser } from '@pikku/better-auth'",
  'export const auth = () => ({ plugins: [virtualUser({ secret: undefined })] })',
  '',
].join('\n')

const virtualUserDeclaration = [
  "import { defineVirtualUsers } from '#pikku/scopes/pikku-virtual-users.gen.js'",
  'defineVirtualUsers({',
  "  founder: { name: 'Anna Müller' },",
  '})',
  '',
].join('\n')

const ids = (findings: { id: string }[]): string[] => findings.map((f) => f.id)

describe('virtual user checks', () => {
  test('no virtual users anywhere → warns, and says nothing further', async () => {
    const tmp = await makeTmp()
    try {
      await mkdir(srcDir(tmp), { recursive: true })
      const findings = await runVirtualUserChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), ['no-virtual-users'])
      assert.strictEqual(findings[0]!.severity, 'warn')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('virtual users in generated meta + virtual user sign-in → no findings', async () => {
    const tmp = await makeTmp()
    try {
      await writeVirtualUserMeta(tmp, { founder: { id: 'founder' } })
      await writeSource(tmp, 'auth.wiring.ts', virtualUserWiring)
      const findings = await runVirtualUserChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a source declaration counts before codegen has ever run', async () => {
    const tmp = await makeTmp()
    try {
      await writeSource(tmp, 'virtual-users.ts', virtualUserDeclaration)
      await writeSource(tmp, 'auth.wiring.ts', virtualUserWiring)
      const findings = await runVirtualUserChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('the deprecated virtualUser() alias still counts as virtual user sign-in', async () => {
    const tmp = await makeTmp()
    try {
      await writeSource(tmp, 'virtual-users.ts', virtualUserDeclaration)
      await writeSource(tmp, 'auth.wiring.ts', deprecatedVirtualUserAliasWiring)
      const findings = await runVirtualUserChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('an empty generated meta falls back to the source scan', async () => {
    const tmp = await makeTmp()
    try {
      await writeVirtualUserMeta(tmp, {})
      await writeSource(tmp, 'virtual-users.ts', virtualUserDeclaration)
      await writeSource(tmp, 'auth.wiring.ts', virtualUserWiring)
      const findings = await runVirtualUserChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('virtual users without virtual user sign-in → warns', async () => {
    const tmp = await makeTmp()
    try {
      await writeSource(tmp, 'virtual-users.ts', virtualUserDeclaration)
      const findings = await runVirtualUserChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [
        'virtual-users-no-virtual-user-sign-in',
      ])
      assert.strictEqual(findings[0]!.severity, 'warn')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a hand-rolled /sign-in/virtual-user route satisfies the check', async () => {
    const tmp = await makeTmp()
    try {
      await writeSource(tmp, 'virtual-users.ts', virtualUserDeclaration)
      await writeSource(
        tmp,
        'virtualUser.http.ts',
        "wireHTTP({ method: 'post', route: '/auth/sign-in/virtual-user' })\n"
      )
      const findings = await runVirtualUserChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('virtual users with no configured environment → warns', async () => {
    const tmp = await makeTmp()
    try {
      await writeSource(tmp, 'virtual-users.ts', virtualUserDeclaration)
      await writeSource(tmp, 'auth.wiring.ts', virtualUserWiring)
      const findings = await runVirtualUserChecks(tmp, {
        ...config,
        environments: {},
      })
      assert.deepStrictEqual(ids(findings), ['virtual-users-no-environments'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a missing pikku config still reports the missing virtual users', async () => {
    const tmp = await makeTmp()
    try {
      const findings = await runVirtualUserChecks(tmp, null)
      assert.deepStrictEqual(ids(findings), ['no-virtual-users'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
