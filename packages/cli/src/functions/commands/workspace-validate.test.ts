import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { runWorkspaceValidate } from '../validate/workspace-validate.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'pikku-workspace-validate-'))
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

async function makeValidWorkspace(root: string) {
  await writeJson(join(root, 'pikku.config.json'), {
    srcDirectories: ['packages/functions/src'],
    outDir: 'packages/functions/.pikku',
    clientFiles: {
      rpcMapDeclarationFile:
        'packages/functions-sdk/src/pikku/rpc-map.gen.d.ts',
      reactQueryFile: 'packages/functions-sdk/src/pikku/api.gen.ts',
    },
  })
  await writeJson(join(root, 'package.json'), {
    workspaces: ['packages/*', 'apps/*'],
    dependencies: { '@pikku/core': '^1.0.0' },
  })
  await mkdir(join(root, 'packages', 'functions', 'src', 'functions'), {
    recursive: true,
  })
  await mkdir(join(root, 'packages', 'functions', 'src', 'wirings'), {
    recursive: true,
  })
  await mkdir(join(root, 'packages', 'functions', 'src', 'types'), {
    recursive: true,
  })
  await mkdir(join(root, 'packages', 'functions', 'tests'), {
    recursive: true,
  })
  await mkdir(join(root, 'packages', 'functions-sdk', 'src', 'pikku'), {
    recursive: true,
  })
  await writeJson(join(root, 'packages', 'functions', 'package.json'), {
    type: 'module',
  })
  await writeFile(
    join(root, 'packages', 'functions', 'src', 'services.ts'),
    'export const createSingletonServices = () => ({})\n',
    'utf8'
  )
  await writeFile(
    join(root, 'packages', 'functions', 'src', 'config.ts'),
    'export const createConfig = () => ({})\n',
    'utf8'
  )
}

describe('pikku workspace validate', () => {
  test('valid workspace → ok=true, zero findings', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      const result = await runWorkspaceValidate(tmp)
      assert.strictEqual(result.ok, true)
      assert.strictEqual(
        result.findings.length,
        0,
        `unexpected findings: ${JSON.stringify(result.findings.map((f) => f.id))}`
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('root is detected from a subdirectory', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      const result = await runWorkspaceValidate(
        join(tmp, 'packages', 'functions', 'src')
      )
      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.root, tmp)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('fabric-only db adapter checks stay out of workspace validate', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await writeJson(join(tmp, 'packages', 'functions', 'package.json'), {
        type: 'module',
        dependencies: { '@pikku/kysely-postgres': '^1.0.0' },
      })
      await writeFile(
        join(tmp, 'packages', 'functions', 'src', 'services.ts'),
        [
          "import { Kysely } from 'kysely'",
          '',
          'export const createSingletonServices = () => ({',
          '  kysely: new Kysely({} as never),',
          '})',
          '',
        ].join('\n'),
        'utf8'
      )

      const result = await runWorkspaceValidate(tmp)
      const ids = result.findings.map((f) => f.id)

      assert.ok(!ids.includes('fn-pkg-postgres-dep'))
      assert.ok(!ids.includes('services-wrong-db-adapter'))
      assert.strictEqual(result.ok, true)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
