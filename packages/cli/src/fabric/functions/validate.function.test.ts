import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  runValidate,
  renderValidate,
  runValidate as runLiveValidate,
} from './validate.function.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'pikku-validate-'))
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

async function makeValidProject(root: string) {
  await writeJson(join(root, 'pikkufabric.config.json'), {
    projectId: 'proj-abc123',
  })
  await writeJson(join(root, 'pikku.config.json'), {
    srcDirectories: ['packages/functions/src'],
    outDir: 'packages/functions/.pikku',
    scaffold: {
      console: 'no-auth',
      rpc: true,
      agent: 'no-auth',
      workflow: 'no-auth',
      events: true,
    },
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
  await writeJson(join(root, 'packages', 'functions', 'package.json'), {
    type: 'module',
    imports: {
      '#pikku': './.pikku/pikku-types.gen.ts',
      '#pikku/*': './.pikku/*',
    },
    dependencies: {
      '@pikku/schema-cfworker': '^0.12.0',
      '@pikku/kysely': '^0.12.0',
    },
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
  await mkdir(join(root, 'db', 'sqlite'), {
    recursive: true,
  })
  await writeFile(
    join(root, 'db', 'sqlite', '0001-init.sql'),
    'CREATE TABLE audit (eventId TEXT PRIMARY KEY);\n',
    'utf8'
  )
  await writeFile(join(root, 'db', 'sqlite-seed.sql'), '-- seed data\n', 'utf8')
  await mkdir(join(root, 'packages', 'mantine-theme'), {
    recursive: true,
  })
  await mkdir(join(root, 'packages', 'components'), {
    recursive: true,
  })
  await writeFile(
    join(root, 'db', 'annotations.ts'),
    '// db column annotations\nexport const annotations = {}\n',
    'utf8'
  )
  await mkdir(join(root, 'knowledge'), { recursive: true })
  await writeFile(
    join(root, 'knowledge', 'design-language.md'),
    '# Design Language\n',
    'utf8'
  )
  await writeFile(
    join(root, 'knowledge', 'security.md'),
    '# Security\n',
    'utf8'
  )
  await writeFile(
    join(root, 'knowledge', 'technology.md'),
    '# Technology\n',
    'utf8'
  )
  await writeFile(
    join(root, '.gitignore'),
    '.pikku\n.pikku-runtime\n.opencode\n.reports\n__fabric_scaffold.vite.config.mjs\n*.gen.ts\n*.gen.js\n',
    'utf8'
  )
  await mkdir(join(root, 'db'), { recursive: true })
  await writeFile(
    join(root, 'db', 'annotations.ts'),
    '// db annotations\n',
    'utf8'
  )
  await mkdir(join(root, 'knowledge'), { recursive: true })
  await writeFile(
    join(root, 'knowledge', 'design-language.md'),
    '# Design Language\n',
    'utf8'
  )
  await writeFile(
    join(root, 'knowledge', 'security.md'),
    '# Security\n',
    'utf8'
  )
  await writeFile(
    join(root, 'knowledge', 'technology.md'),
    '# Technology\n',
    'utf8'
  )
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

  describe('pikkufabric.config.json', () => {
    test('missing pikkufabric.config.json → info (not blocking)', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(join(tmp, 'pikkufabric.config.json'), { force: true })
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
        await writeJson(join(tmp, 'pikkufabric.config.json'), {}) // no projectId
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
        await writeJson(join(tmp, 'pikkufabric.config.json'), {
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

    test('empty scaffold → error for console/rpc/agent/workflow, warn for events', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'pikku.config.json'), {
          srcDirectories: ['packages/functions/src'],
          outDir: 'packages/functions/.pikku',
          scaffold: {
            pikkuDir: 'packages/functions/src/scaffold',
            // console/rpc/agent/workflow/events all omitted
          },
          clientFiles: {
            rpcMapDeclarationFile:
              'packages/functions-sdk/src/pikku/rpc-map.gen.d.ts',
          },
        })
        const result = await runLiveValidate(tmp)
        assert.strictEqual(result.ok, false)
        const byId = (id: string) => result.findings.find((f) => f.id === id)
        for (const key of ['console', 'rpc', 'agent', 'workflow']) {
          const f = byId(`pikku-config-no-scaffold-${key}`)
          assert.ok(f, `expected error for scaffold.${key}`)
          assert.strictEqual(f!.severity, 'error')
        }
        const events = byId('pikku-config-no-scaffold-events')
        assert.ok(events, 'expected events finding')
        assert.strictEqual(events!.severity, 'warn')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('full canonical scaffold → no scaffold findings', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp) // console/rpc/agent/workflow/events all set
        const result = await runLiveValidate(tmp)
        assert.ok(
          !result.findings.some((f) =>
            f.id.startsWith('pikku-config-no-scaffold-')
          ),
          `unexpected scaffold findings: ${JSON.stringify(
            result.findings
              .filter((f) => f.id.startsWith('pikku-config-no-scaffold-'))
              .map((f) => f.id)
          )}`
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
          scaffold: {
            console: 'no-auth',
            rpc: true,
            agent: 'no-auth',
            workflow: 'no-auth',
            events: true,
          },
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

  describe('.gitignore generated/runtime artifacts', () => {
    test('missing entries → warn listing them', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        // .gitignore without .opencode, .pikku-runtime, the scaffold vite config
        await writeFile(
          join(tmp, '.gitignore'),
          '.pikku\n*.gen.ts\n*.gen.js\n',
          'utf8'
        )
        const result = await runLiveValidate(tmp)
        const finding = result.findings.find(
          (f) => f.id === 'gitignore-missing-generated'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'warn') // warn — does not block ok
        assert.ok(finding!.message.includes('.opencode'))
        assert.ok(finding!.message.includes('.pikku-runtime'))
        assert.ok(
          finding!.message.includes('__fabric_scaffold.vite.config.mjs')
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing .pikku and gen-file ignore → flagged', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeFile(
          join(tmp, '.gitignore'),
          '.opencode\n.pikku-runtime\n__fabric_scaffold.vite.config.mjs\n',
          'utf8'
        )
        const result = await runLiveValidate(tmp)
        const finding = result.findings.find(
          (f) => f.id === 'gitignore-missing-generated'
        )
        assert.ok(finding)
        assert.ok(finding!.message.includes('.pikku'))
        assert.ok(finding!.message.includes('*.gen.*'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('*.gen.* glob satisfies the gen-file requirement', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeFile(
          join(tmp, '.gitignore'),
          '.opencode\n.pikku\n.pikku-runtime\n.reports\n__fabric_scaffold.vite.config.mjs\n*.gen.*\n',
          'utf8'
        )
        const result = await runLiveValidate(tmp)
        assert.ok(
          !result.findings.some((f) => f.id === 'gitignore-missing-generated')
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('canonical .gitignore (gen.ts + gen.js pair) → no finding', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp) // writes the canonical .gitignore
        const result = await runLiveValidate(tmp)
        assert.ok(
          !result.findings.some((f) => f.id === 'gitignore-missing-generated')
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('root package.json', () => {
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
          imports: {
            '#pikku': './.pikku/pikku-types.gen.ts',
            '#pikku/*': './.pikku/*',
          },
          dependencies: {
            '@pikku/cloudflare': '^0.12.6',
            '@pikku/schema-cfworker': '^0.12.0',
            '@pikku/kysely': '^0.12.0',
          },
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

    test('missing @pikku/schema-cfworker → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'packages', 'functions', 'package.json'), {
          type: 'module',
          imports: { '#pikku': './.pikku/pikku-types.gen.ts' },
          dependencies: { '@pikku/kysely': '^0.12.0' }, // schema-cfworker omitted
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        const finding = result.findings.find(
          (f) => f.id === 'missing-schema-cfworker'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'error')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing @pikku/kysely → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(join(tmp, 'packages', 'functions', 'package.json'), {
          type: 'module',
          imports: { '#pikku': './.pikku/pikku-types.gen.ts' },
          dependencies: { '@pikku/schema-cfworker': '^0.12.0' }, // kysely omitted
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        const finding = result.findings.find(
          (f) => f.id === 'missing-pikku-kysely'
        )
        assert.ok(finding)
        assert.strictEqual(finding!.severity, 'error')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('agent units declared but @pikku/ai-vercel / @ai-sdk/openai-compatible missing → errors', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        // declare an agent via the generated agent meta, but omit the AI deps
        await mkdir(join(tmp, 'packages', 'functions', '.pikku', 'agent'), {
          recursive: true,
        })
        await writeJson(
          join(
            tmp,
            'packages',
            'functions',
            '.pikku',
            'agent',
            'pikku-agent-wirings-meta.gen.json'
          ),
          { agentsMeta: { bookingAgent: {} } }
        )
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        assert.ok(
          result.findings.some((f) => f.id === 'missing-ai-vercel'),
          'expected missing-ai-vercel'
        )
        assert.ok(
          result.findings.some(
            (f) => f.id === 'missing-ai-sdk-openai-compatible'
          ),
          'expected missing-ai-sdk-openai-compatible'
        )
        assert.ok(
          result.findings.some((f) => f.id === 'missing-ai-sdk-core'),
          'expected missing-ai-sdk-core'
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('no agent units → no AI dep errors', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp) // no agent meta written
        const result = await runValidate(tmp)
        assert.ok(
          !result.findings.some(
            (f) =>
              f.id === 'missing-ai-vercel' ||
              f.id === 'missing-ai-sdk-openai-compatible' ||
              f.id === 'missing-ai-sdk-core'
          )
        )
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
        const migrDir = join(tmp, 'db', 'sqlite')
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
        const migrDir = join(tmp, 'db', 'sqlite')
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
        const migrDir = join(tmp, 'db', 'sqlite')
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
        const migrDir = join(tmp, 'db', 'sqlite')
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
        const migrDir = join(tmp, 'db', 'sqlite')
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
        const migrDir = join(tmp, 'db', 'sqlite')
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

  describe('db/sqlite-seed.sql', () => {
    test('missing db/sqlite-seed.sql → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(join(tmp, 'db', 'sqlite-seed.sql'), {
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

    test('missing db/sqlite/ → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(join(tmp, 'db', 'sqlite'), {
          recursive: true,
          force: true,
        })
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

  describe('packages/mantine-theme and packages/components presence', () => {
    test('missing packages/mantine-theme → info', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(join(tmp, 'packages', 'mantine-theme'), {
          recursive: true,
          force: true,
        })
        const result = await runValidate(tmp)
        const finding = result.findings.find((f) => f.id === 'theme-missing')
        assert.ok(finding, 'expected theme-missing finding')
        assert.strictEqual(finding!.severity, 'info')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('missing packages/components → info', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await rm(join(tmp, 'packages', 'components'), {
          recursive: true,
          force: true,
        })
        const result = await runValidate(tmp)
        const finding = result.findings.find(
          (f) => f.id === 'components-missing'
        )
        assert.ok(finding, 'expected components-missing finding')
        assert.strictEqual(finding!.severity, 'info')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('apps/ frontend checks', () => {
    test('app not declared in pikkufabric.config.json frontends → warn', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await mkdir(join(tmp, 'apps', 'web'), { recursive: true })
        await writeJson(join(tmp, 'apps', 'web', 'package.json'), {
          name: 'web',
        })
        const result = await runValidate(tmp)
        const finding = result.findings.find(
          (f) => f.id === 'app-not-declared-web'
        )
        assert.ok(finding, 'expected app-not-declared-web finding')
        assert.strictEqual(finding!.severity, 'warn')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('pikkufabric.config.json frontend cwd does not exist → error', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await mkdir(join(tmp, 'apps'), { recursive: true })
        await writeJson(join(tmp, 'pikkufabric.config.json'), {
          projectId: 'proj-abc123',
          frontends: { web: { cwd: './apps/web', kind: 'ssr' } },
        })
        const result = await runValidate(tmp)
        assert.strictEqual(result.ok, false)
        const finding = result.findings.find(
          (f) => f.id === 'frontend-cwd-missing-web'
        )
        assert.ok(finding, 'expected frontend-cwd-missing-web finding')
        assert.strictEqual(finding!.severity, 'error')
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('app missing functions-sdk, theme, and components deps → info findings', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await writeJson(
          join(tmp, 'packages', 'functions-sdk', 'package.json'),
          {
            name: '@project/functions-sdk',
          }
        )
        await writeJson(
          join(tmp, 'packages', 'mantine-theme', 'package.json'),
          {
            name: '@project/mantine-theme',
          }
        )
        await writeJson(join(tmp, 'packages', 'components', 'package.json'), {
          name: '@project/components',
        })
        await mkdir(join(tmp, 'apps', 'web'), { recursive: true })
        await writeJson(join(tmp, 'apps', 'web', 'package.json'), {
          name: 'web',
          dependencies: {},
        })
        await writeJson(join(tmp, 'pikkufabric.config.json'), {
          projectId: 'proj-abc123',
          frontends: { web: { cwd: 'apps/web', kind: 'ssr' } },
        })
        const result = await runValidate(tmp)
        assert.ok(
          result.findings.some((f) => f.id === 'app-missing-functions-sdk-web'),
          'expected app-missing-functions-sdk-web'
        )
        assert.ok(
          result.findings.some((f) => f.id === 'app-missing-theme-web'),
          'expected app-missing-theme-web'
        )
        assert.ok(
          result.findings.some((f) => f.id === 'app-missing-components-web'),
          'expected app-missing-components-web'
        )
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })

    test('app directory without package.json is skipped gracefully', async () => {
      const tmp = await makeTmp()
      try {
        await makeValidProject(tmp)
        await mkdir(join(tmp, 'apps', 'web'), { recursive: true })
        // no package.json in apps/web — appPkg will be null → continue
        const result = await runValidate(tmp)
        // app-not-declared warn fires (no frontends declared), but no crash
        assert.ok(result.findings.some((f) => f.id === 'app-not-declared-web'))
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  })

  describe('renderValidate', () => {
    function captureLog(fn: () => void): string[] {
      const lines: string[] = []
      const orig = console.log
      console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
      }
      try {
        fn()
      } finally {
        console.log = orig
      }
      return lines
    }

    test('prints ok message when there are no findings', () => {
      const lines = captureLog(() =>
        renderValidate(null, { ok: true, root: '/tmp/proj', findings: [] })
      )
      assert.ok(lines.some((l) => l.includes('All checks passed')))
    })

    test('prints error, warn, and info findings with correct icons', () => {
      const lines = captureLog(() =>
        renderValidate(null, {
          ok: false,
          root: '/tmp/proj',
          findings: [
            {
              id: 'e1',
              severity: 'error',
              message: 'bad error',
              path: '/tmp/proj/foo',
              fixHint: 'fix it',
            },
            {
              id: 'w1',
              severity: 'warn',
              message: 'a warning',
              path: '/tmp/proj/bar',
              fixHint: 'consider this',
            },
            {
              id: 'i1',
              severity: 'info',
              message: 'some info',
              path: '/tmp/proj/baz',
              fixHint: 'note this',
            },
          ],
        })
      )
      assert.ok(lines.some((l) => l.includes('bad error')))
      assert.ok(lines.some((l) => l.includes('a warning')))
      assert.ok(lines.some((l) => l.includes('some info')))
    })

    test('prints no-errors footer when ok=true but findings exist', () => {
      const lines = captureLog(() =>
        renderValidate(null, {
          ok: true,
          root: '/tmp/proj',
          findings: [
            {
              id: 'w1',
              severity: 'warn',
              message: 'a warning',
              path: '/tmp/proj/bar',
              fixHint: 'consider this',
            },
          ],
        })
      )
      assert.ok(lines.some((l) => l.includes('no errors')))
    })

    test('relative path is shown instead of absolute in findings', () => {
      const root = '/tmp/proj'
      const lines = captureLog(() =>
        renderValidate(null, {
          ok: false,
          root,
          findings: [
            {
              id: 'e1',
              severity: 'error',
              message: 'bad error',
              path: `${root}/packages/functions/src/services.ts`,
              fixHint: 'fix it',
            },
          ],
        })
      )
      assert.ok(
        lines.some((l) => l.includes('packages/functions/src/services.ts'))
      )
    })
  })
})

describe('better-auth stateless session (live validate.function)', () => {
  const authFile = (cookieCache: boolean) =>
    `import { betterAuth } from 'better-auth'
import { pikkuBetterAuth } from '#pikku/pikku-types.gen.js'
export const auth = pikkuBetterAuth(async ({ kysely, secrets }) => {
  const BETTER_AUTH_SECRET = await secrets.getSecret('BETTER_AUTH_SECRET')
  return betterAuth({
    secret: BETTER_AUTH_SECRET,
    database: { db: kysely as any, type: 'sqlite' },
    emailAndPassword: { enabled: true },
    ${cookieCache ? 'session: { cookieCache: { enabled: true } },' : ''}
  })
})
`

  test('cookieCache disabled → warns better-auth-stateless-session-disabled', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      await writeFile(
        join(tmp, 'packages', 'functions', 'src', 'wirings', 'auth.wiring.ts'),
        authFile(false),
        'utf8'
      )
      const result = await runLiveValidate(tmp)
      const ids = result.findings.map((f) => f.id)
      assert.ok(
        ids.includes('better-auth-stateless-session-disabled'),
        `expected warn, got: ${JSON.stringify(ids)}`
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('cookieCache enabled → no stateless-session warning', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      await writeFile(
        join(tmp, 'packages', 'functions', 'src', 'wirings', 'auth.wiring.ts'),
        authFile(true),
        'utf8'
      )
      const result = await runLiveValidate(tmp)
      const ids = result.findings.map((f) => f.id)
      assert.ok(
        !ids.includes('better-auth-stateless-session-disabled'),
        `unexpected warn: ${JSON.stringify(ids)}`
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('global stateful betterAuthSession → warns better-auth-stateful-session-global', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      await writeFile(
        join(tmp, 'packages', 'functions', 'src', 'wirings', 'middleware.ts'),
        `import { addHTTPMiddleware } from '#pikku'
import { betterAuthSession } from '@pikku/better-auth'
addHTTPMiddleware('*', [betterAuthSession()])
`,
        'utf8'
      )
      const result = await runLiveValidate(tmp)
      const ids = result.findings.map((f) => f.id)
      assert.ok(
        ids.includes('better-auth-stateful-session-global'),
        `expected warn, got: ${JSON.stringify(ids)}`
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('i18n + @pikku/mantine convergence — Paraglide (live validate.function)', () => {
  // Scaffold an apps/web react frontend with the given package deps + src file,
  // optionally wiring the full Paraglide stack (messages/ + project.inlang/).
  const makeApp = async (
    root: string,
    opts: {
      deps: Record<string, string>
      srcFile?: { name: string; body: string }
      paraglideWired?: boolean
    }
  ) => {
    const app = join(root, 'apps', 'web')
    await mkdir(join(app, 'src'), { recursive: true })
    await writeJson(join(app, 'package.json'), {
      name: 'web',
      dependencies: opts.deps,
    })
    if (opts.srcFile) {
      const dest = join(app, 'src', opts.srcFile.name)
      await mkdir(join(dest, '..'), { recursive: true })
      await writeFile(dest, opts.srcFile.body, 'utf8')
    }
    if (opts.paraglideWired) {
      await mkdir(join(app, 'messages'), { recursive: true })
      await writeJson(join(app, 'messages', 'en.json'), { hello: 'Hello' })
      await mkdir(join(app, 'project.inlang'), { recursive: true })
      await writeJson(join(app, 'project.inlang', 'settings.json'), {
        baseLocale: 'en',
        locales: ['en'],
      })
    }
  }
  const PARAGLIDE_DEPS = {
    react: '^19.0.0',
    '@pikku/mantine': '^0.12.5',
    '@inlang/paraglide-js': '^2.20.0',
  }

  test('residual i18next dep → error app-legacy-i18next-dep-web', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      await makeApp(tmp, {
        deps: {
          react: '^19.0.0',
          i18next: '^23.0.0',
          'react-i18next': '^15.0.0',
        },
        paraglideWired: true,
      })
      const result = await runLiveValidate(tmp)
      const f = result.findings.find(
        (f) => f.id === 'app-legacy-i18next-dep-web'
      )
      assert.ok(
        f,
        `expected app-legacy-i18next-dep-web, got: ${JSON.stringify(result.findings.map((x) => x.id))}`
      )
      assert.strictEqual(f!.severity, 'error')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('residual useTranslation()/useI18n() call → error app-legacy-i18n-usage-web', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      await makeApp(tmp, {
        deps: PARAGLIDE_DEPS,
        paraglideWired: true,
        srcFile: {
          name: 'Page.tsx',
          body: `import { useTranslation } from 'react-i18next'\nexport const Page = () => { const { t } = useTranslation(); return t('a.b') }\n`,
        },
      })
      const result = await runLiveValidate(tmp)
      const f = result.findings.find(
        (f) => f.id === 'app-legacy-i18n-usage-web'
      )
      assert.ok(
        f,
        `expected app-legacy-i18n-usage-web, got: ${JSON.stringify(result.findings.map((x) => x.id))}`
      )
      assert.strictEqual(f!.severity, 'error')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('missing @inlang/paraglide-js → error app-missing-paraglide-web', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      await makeApp(tmp, {
        deps: { react: '^19.0.0', '@pikku/mantine': '^0.12.5' },
      })
      const result = await runLiveValidate(tmp)
      const f = result.findings.find(
        (f) => f.id === 'app-missing-paraglide-web'
      )
      assert.ok(
        f,
        `expected app-missing-paraglide-web, got: ${JSON.stringify(result.findings.map((x) => x.id))}`
      )
      assert.strictEqual(f!.severity, 'error')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('paraglide dep but no messages/ → error app-paraglide-not-wired-web', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      await makeApp(tmp, { deps: PARAGLIDE_DEPS }) // no paraglideWired
      const result = await runLiveValidate(tmp)
      const f = result.findings.find(
        (f) => f.id === 'app-paraglide-not-wired-web'
      )
      assert.ok(
        f,
        `expected app-paraglide-not-wired-web, got: ${JSON.stringify(result.findings.map((x) => x.id))}`
      )
      assert.strictEqual(f!.severity, 'error')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('full Paraglide stack + m usage → no i18n/mantine errors', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      await makeApp(tmp, {
        deps: PARAGLIDE_DEPS,
        paraglideWired: true,
        srcFile: {
          name: 'Page.tsx',
          body: `import { m } from '@/i18n/messages'\nimport { Button } from '@pikku/mantine/core'\nexport const Page = () => <Button>{m.hello()}</Button>\n`,
        },
      })
      const result = await runLiveValidate(tmp)
      const i18nErrors = result.findings.filter(
        (f) =>
          f.severity === 'error' &&
          (f.id.startsWith('app-legacy-i18n') ||
            f.id.startsWith('app-missing-paraglide') ||
            f.id.startsWith('app-paraglide-not-wired') ||
            f.id.startsWith('app-raw-mantine') ||
            f.id.startsWith('app-missing-pikku-mantine'))
      )
      assert.strictEqual(
        i18nErrors.length,
        0,
        `unexpected i18n/mantine errors: ${JSON.stringify(i18nErrors.map((x) => x.id))}`
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('scaffold src/i18n/config.ts comment mentioning useTranslation is not flagged legacy', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidProject(tmp)
      await makeApp(tmp, {
        deps: PARAGLIDE_DEPS,
        paraglideWired: true,
        srcFile: {
          name: 'i18n/config.ts',
          body: `// the codemod injects useLocale() wherever const { t } = useTranslation() lived\nexport const useLocale = () => 'en'\n`,
        },
      })
      const result = await runLiveValidate(tmp)
      assert.ok(
        !result.findings.some((f) => f.id === 'app-legacy-i18n-usage-web'),
        `scaffold comment wrongly flagged: ${JSON.stringify(result.findings.map((x) => x.id))}`
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
