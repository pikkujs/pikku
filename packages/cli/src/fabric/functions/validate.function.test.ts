import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runValidate } from './validate-core.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'pikku-validate-'))
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

async function makeValidProject(root: string) {
  await writeJson(join(root, 'fabric.config.json'), {
    projectId: 'proj-abc123',
  })
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
    devDependencies: { '@pikku/fabric-cli': '^1.0.0' },
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
  await writeJson(join(root, 'packages', 'functions', 'package.json'), {
    type: 'module',
  })
  await writeFile(
    join(root, 'packages', 'functions', 'src', 'services.ts'),
    '// no DB\nexport const createSingletonServices = () => ({})\n',
    'utf8'
  )
  await writeFile(
    join(root, 'packages', 'functions', 'src', 'config.ts'),
    'export const createConfig = () => ({})\n',
    'utf8'
  )
  await mkdir(join(root, 'packages', 'functions-sdk', 'src', 'pikku'), {
    recursive: true,
  })
  await mkdir(join(root, 'packages', 'functions', 'db', 'migrations'), {
    recursive: true,
  })
  await writeFile(
    join(root, 'packages', 'functions', 'db', 'seed.sql'),
    '-- seed data\n',
    'utf8'
  )
  await mkdir(join(root, 'packages', 'theme'), {
    recursive: true,
  })
  await mkdir(join(root, 'packages', 'components'), {
    recursive: true,
  })
}

describe('pikku fabric validate', () => {
  test('empty directory → errors for all required items', async () => {
    const tmp = await makeTmp()
    try {
      const result = await runValidate(tmp)
      assert.strictEqual(result.ok, false)
      const ids = result.findings.map((f) => f.id)
      assert.ok(ids.includes('fabric-config-missing'), 'fabric-config-missing')
      assert.ok(ids.includes('pikku-config-missing'), 'pikku-config-missing')
      assert.ok(ids.includes('root-package-missing'), 'root-package-missing')
      assert.ok(ids.includes('functions-pkg-missing'), 'functions-pkg-missing')
      // fabric-config-missing is info, not error — ok=false is from other checks
      const fabricFinding = result.findings.find(
        (f) => f.id === 'fabric-config-missing'
      )
      assert.strictEqual(fabricFinding?.severity, 'info')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('valid project → ok=true, zero findings', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      const result = await runValidate(tmp)
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
      await makeValidProject(tmp)
      const subdir = join(tmp, 'packages', 'functions', 'src')
      const result = await runValidate(subdir)
      assert.strictEqual(result.ok, true)
      assert.strictEqual(result.root, tmp)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  describe('fabric.config.json', () => {
    test('missing fabric.config.json → info (not blocking)', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(join(tmp, 'fabric.config.json'), { force: true })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true) // info only — validate works without fabric config
        const finding = result.findings.find(
          (f) => f.id === 'fabric-config-missing'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'info')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing projectId → info (not blocking)', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'fabric.config.json'), {}) // no projectId
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true)
        const ids = result.findings.map((f) => f.id)
        const finding = result.findings.find(
          (f) => f.id === 'fabric-config-no-project-id'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'info')
        assert.ok(!ids.includes('fabric-config-missing'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('placeholder projectId "__PROJECT_ID__" → info (not blocking)', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'fabric.config.json'), {
          projectId: '__PROJECT_ID__',
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true)
        const finding = result.findings.find(
          (f) => f.id === 'fabric-config-placeholder-project-id'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'info')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('pikku.config.json', () => {
    test('missing srcDirectories → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'pikku.config.json'), {
          outDir: 'packages/functions/.pikku',
          clientFiles: {
            rpcMapDeclarationFile:
              'packages/functions-sdk/src/pikku/rpc-map.gen.d.ts',
          },
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        assert.ok(
          result.findings.some((f) => f.id === 'pikku-config-no-src-dirs')
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing outDir → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'pikku.config.json'), {
          srcDirectories: ['packages/functions/src'],
          clientFiles: {
            rpcMapDeclarationFile:
              'packages/functions-sdk/src/pikku/rpc-map.gen.d.ts',
          },
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        assert.ok(
          result.findings.some((f) => f.id === 'pikku-config-no-out-dir')
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing clientFiles → info (not an error)', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'pikku.config.json'), {
          srcDirectories: ['packages/functions/src'],
          outDir: 'packages/functions/.pikku',
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true) // info only
        const finding = result.findings.find(
          (f) => f.id === 'pikku-config-no-client-files'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'info')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('root package.json', () => {
    test('missing @pikku/fabric-cli → info (not blocking)', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'package.json'), {
          workspaces: ['packages/*'],
          dependencies: { '@pikku/core': '^1.0.0' },
          devDependencies: {},
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true) // info only — not required to run fabric deploy
        const finding = result.findings.find(
          (f) => f.id === 'missing-fabric-cli'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'info')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing @pikku/core → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'package.json'), {
          workspaces: ['packages/*'],
          dependencies: {},
          devDependencies: { '@pikku/fabric-cli': '^1.0.0' },
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        assert.ok(result.findings.some((f) => f.id === 'missing-core'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing workspaces → warn (ok=true)', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'package.json'), {
          dependencies: { '@pikku/core': '^1.0.0' },
          devDependencies: { '@pikku/fabric-cli': '^1.0.0' },
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true)
        const finding = result.findings.find(
          (f) => f.id === 'root-package-no-workspaces'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'warn')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('referenced vendor tgz missing → warn per package', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'package.json'), {
          workspaces: ['packages/*'],
          dependencies: {
            '@pikku/core': 'file:./vendor/pikku-core.tgz',
          },
          devDependencies: {
            '@pikku/fabric-cli': 'file:./vendor/pikku-fabric-cli.tgz',
          },
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true) // vendor missing = warn, not error
        const vendorFindings = result.findings.filter((f) =>
          f.id.startsWith('vendor-missing-')
        )
        assert.ok(
          vendorFindings.length >= 2,
          'expected warn for each missing tgz'
        )
        assert.ok(vendorFindings.every((f) => f.severity === 'warn'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('vendor tgz present → no warning', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await mkdir(join(tmp, 'vendor'), { recursive: true })
        await writeFile(join(tmp, 'vendor', 'pikku-core.tgz'), 'fake', 'utf8')
        await writeJson(join(tmp, 'package.json'), {
          workspaces: ['packages/*'],
          dependencies: { '@pikku/core': 'file:./vendor/pikku-core.tgz' },
          devDependencies: { '@pikku/fabric-cli': '^1.0.0' },
        })
        const result = await runValidate(tmp)
        assert.ok(
          !result.findings.some((f) => f.id === 'vendor-missing--pikku-core')
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('packages/functions/package.json', () => {
    test('missing type: "module" → warn (ok=true)', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'packages', 'functions', 'package.json'), {
          dependencies: { '@pikku/cloudflare': '^0.12.6' },
          // no type: 'module'
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true)
        const finding = result.findings.find(
          (f) => f.id === 'functions-pkg-no-esm'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'warn')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('@pikku/kysely-postgres in functions deps → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'packages', 'functions', 'package.json'), {
          type: 'module',
          dependencies: { '@pikku/kysely-postgres': '^0.12.0' },
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        const finding = result.findings.find(
          (f) => f.id === 'fn-pkg-postgres-dep'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'error')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('services.ts', () => {
    test('uses Kysely without LibsqlWebDialect → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeFile(
          join(tmp, 'packages', 'functions', 'src', 'services.ts'),
          "import { Kysely } from 'kysely'\nimport { PostgresDialect } from 'kysely'\n",
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        assert.ok(
          result.findings.some((f) => f.id === 'services-wrong-db-adapter')
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('uses LibsqlWebDialect → no adapter error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'package.json'), {
          workspaces: ['packages/*'],
          dependencies: {
            '@pikku/core': '^1.0.0',
            '@pikku/kysely-sqlite': '^1.0.0',
          },
          devDependencies: { '@pikku/fabric-cli': '^1.0.0' },
        })
        await writeFile(
          join(tmp, 'packages', 'functions', 'src', 'services.ts'),
          "import { Kysely } from 'kysely'\nimport { LibsqlWebDialect } from '@pikku/kysely-sqlite'\n",
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.ok(
          !result.findings.some((f) => f.id === 'services-wrong-db-adapter')
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('uses process.env directly → info (not blocking)', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeFile(
          join(tmp, 'packages', 'functions', 'src', 'services.ts'),
          'const url = process.env.DATABASE_URL\n',
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true) // info only — process.env works with nodejs_compat_v2
        const finding = result.findings.find(
          (f) => f.id === 'services-process-env'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'info')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('LibsqlWebDialect used but @pikku/kysely-sqlite absent → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        // @pikku/kysely-sqlite intentionally absent from package.json
        await writeFile(
          join(tmp, 'packages', 'functions', 'src', 'services.ts'),
          "import { LibsqlWebDialect } from '@pikku/kysely-sqlite'\n",
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        assert.ok(result.findings.some((f) => f.id === 'missing-kysely-sqlite'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('db migrations', () => {
    test('sequential migrations → no error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        const migrDir = join(tmp, 'packages', 'functions', 'db', 'migrations')
        await mkdir(migrDir, { recursive: true })
        await writeFile(
          join(migrDir, '0001-init.sql'),
          'CREATE TABLE a (id INTEGER);',
          'utf8'
        )
        await writeFile(
          join(migrDir, '0002-users.sql'),
          'CREATE TABLE b (id INTEGER);',
          'utf8'
        )
        await writeFile(
          join(migrDir, '0003-index.sql'),
          'CREATE INDEX idx ON a (id);',
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.ok(!result.findings.some((f) => f.id === 'migration-gap'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('gap in migration numbering → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        const migrDir = join(tmp, 'packages', 'functions', 'db', 'migrations')
        await mkdir(migrDir, { recursive: true })
        await writeFile(join(migrDir, '0001-init.sql'), 'SELECT 1;', 'utf8')
        await writeFile(join(migrDir, '0003-skip.sql'), 'SELECT 1;', 'utf8') // 0002 missing
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        const finding = result.findings.find((f) => f.id === 'migration-gap')
        assert.ok(finding)
        assert.ok(finding!.message.includes('2'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('PostgreSQL SERIAL syntax → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        const migrDir = join(tmp, 'packages', 'functions', 'db', 'migrations')
        await mkdir(migrDir, { recursive: true })
        await writeFile(
          join(migrDir, '0001-init.sql'),
          'CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL);',
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        const finding = result.findings.find((f) =>
          f.id?.startsWith('migration-postgres-sql-')
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'error')
        assert.ok(finding!.message.includes('SERIAL'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('PostgreSQL JSONB type → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        const migrDir = join(tmp, 'packages', 'functions', 'db', 'migrations')
        await mkdir(migrDir, { recursive: true })
        await writeFile(
          join(migrDir, '0001-init.sql'),
          'CREATE TABLE events (id TEXT PRIMARY KEY, payload JSONB NOT NULL);',
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        assert.ok(
          result.findings.some(
            (f) =>
              f.id?.startsWith('migration-postgres-sql-') &&
              f.message.includes('JSONB')
          )
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('PostgreSQL :: cast syntax → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        const migrDir = join(tmp, 'packages', 'functions', 'db', 'migrations')
        await mkdir(migrDir, { recursive: true })
        await writeFile(
          join(migrDir, '0001-init.sql'),
          "INSERT INTO settings VALUES ('x'::text, 'y'::text);",
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        assert.ok(
          result.findings.some((f) =>
            f.id?.startsWith('migration-postgres-sql-')
          )
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('SQLite-compatible migration → no postgres errors', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        const migrDir = join(tmp, 'packages', 'functions', 'db', 'migrations')
        await mkdir(migrDir, { recursive: true })
        await writeFile(
          join(migrDir, '0001-init.sql'),
          "CREATE TABLE kanban_card (\n  card_id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT (datetime('now'))\n);",
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.ok(
          !result.findings.some((f) =>
            f.id?.startsWith('migration-postgres-sql-')
          )
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('db/seed.sql', () => {
    test('missing db/seed.sql → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(join(tmp, 'packages', 'functions', 'db', 'seed.sql'), {
          force: true,
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        const finding = result.findings.find((f) => f.id === 'seed-sql-missing')
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'error')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing db/migrations/ → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(
          join(tmp, 'packages', 'functions', 'db', 'migrations'),
          { recursive: true, force: true }
        )
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        const finding = result.findings.find(
          (f) => f.id === 'migrations-dir-missing'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'error')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('db.types.ts', () => {
    test('re-export only → no warning', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeFile(
          join(tmp, 'packages', 'functions', 'src', 'types', 'db.types.ts'),
          "export type { DB } from '../../.pikku/db/schema.js'\n",
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.ok(!result.findings.some((f) => f.id === 'db-types-hand-edited'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('inline interface definitions without re-export → warn', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeFile(
          join(tmp, 'packages', 'functions', 'src', 'types', 'db.types.ts'),
          'export interface User { id: number; name: string }\nexport interface Card { id: number }\n',
          'utf8'
        )
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true) // warn only
        assert.ok(result.findings.some((f) => f.id === 'db-types-hand-edited'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('optional structure (info findings)', () => {
    test('missing src/functions, src/wirings, src/config.ts → info not error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(join(tmp, 'packages', 'functions', 'src', 'functions'), {
          recursive: true,
          force: true,
        })
        await rm(join(tmp, 'packages', 'functions', 'src', 'wirings'), {
          recursive: true,
          force: true,
        })
        await rm(join(tmp, 'packages', 'functions', 'src', 'config.ts'), {
          force: true,
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true)
        const ids = result.findings.map((f) => f.id)
        assert.ok(ids.includes('functions-dir-missing'))
        assert.ok(ids.includes('wirings-dir-missing'))
        assert.ok(ids.includes('config-missing'))
        assert.ok(result.findings.every((f) => f.severity === 'info'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing packages/functions-sdk → info not error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(join(tmp, 'packages', 'functions-sdk'), {
          recursive: true,
          force: true,
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, true)
        assert.ok(result.findings.some((f) => f.id === 'functions-sdk-missing'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })
})
