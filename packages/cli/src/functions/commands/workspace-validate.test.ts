import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  readJsonSafe,
  runWorkspaceValidate,
  type Finding,
} from '../validate/workspace-validate.js'

async function makeTmp() {
  return mkdtemp(join(tmpdir(), 'pikku-workspace-validate-'))
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

async function setRootScripts(
  root: string,
  scripts: Record<string, string>,
  extraDeps: Record<string, string> = {}
) {
  await writeJson(join(root, 'package.json'), {
    workspaces: ['packages/*', 'apps/*'],
    dependencies: { '@pikku/core': '^1.0.0', ...extraDeps },
    scripts,
  })
}

async function setFunctionsDeps(root: string, deps: Record<string, string>) {
  await writeJson(join(root, 'packages', 'functions', 'package.json'), {
    type: 'module',
    dependencies: { zod: '^4', ...deps },
  })
}

async function setLintRule(root: string, severity: string) {
  await writeJson(join(root, 'pikku.config.json'), {
    srcDirectories: ['packages/functions/src'],
    outDir: 'packages/functions/.pikku',
    dev: { db: { file: '.pikku-runtime/dev.db' } },
    clientFiles: {
      rpcMapDeclarationFile:
        'packages/functions-sdk/src/pikku/rpc-map.gen.d.ts',
      reactQueryFile: 'packages/functions-sdk/src/pikku/api.gen.ts',
    },
    scaffold: { console: true },
    lint: { customServerBootstrap: severity },
  })
}

async function makeValidWorkspace(root: string) {
  await writeJson(join(root, 'pikku.config.json'), {
    srcDirectories: ['packages/functions/src'],
    outDir: 'packages/functions/.pikku',
    dev: {
      db: {
        file: '.pikku-runtime/dev.db',
      },
    },
    clientFiles: {
      rpcMapDeclarationFile:
        'packages/functions-sdk/src/pikku/rpc-map.gen.d.ts',
      reactQueryFile: 'packages/functions-sdk/src/pikku/api.gen.ts',
    },
    scaffold: {
      console: true,
      rpc: true,
      agent: true,
      workflow: true,
      events: true,
    },
    environments: { local: { apiUrl: 'http://localhost:4002' } },
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
  await mkdir(join(root, 'packages', 'functions', '.pikku', 'middleware'), {
    recursive: true,
  })
  await mkdir(join(root, 'packages', 'functions', 'db', 'migrations'), {
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
    dependencies: { zod: '^4' },
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
  await writeFile(
    join(
      root,
      'packages',
      'functions',
      '.pikku',
      'middleware',
      'pikku-middleware-groups-meta.gen.json'
    ),
    JSON.stringify({ definitions: {}, instances: {}, httpGroups: {} }, null, 2),
    'utf8'
  )
  await writeFile(
    join(root, 'packages', 'functions', 'src', 'personas.virtual-user.ts'),
    [
      "import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'",
      "definePersonas({ founder: { name: 'Anna Müller' } })",
      '',
    ].join('\n'),
    'utf8'
  )
  await writeFile(
    join(root, 'packages', 'functions', 'src', 'wirings', 'auth.wiring.ts'),
    [
      "import { actor } from '@pikku/better-auth'",
      'export const auth = () => ({ plugins: [actor({ secret: undefined })] })',
      '',
    ].join('\n'),
    'utf8'
  )
  await mkdir(join(root, 'knowledge'), { recursive: true })
  await writeFile(
    join(root, 'knowledge', 'index.md'),
    [
      '---',
      'type: overview',
      'title: Fixture knowledge base',
      'description: What this app is, for a workspace that has one',
      '---',
      '',
      '# Fixture knowledge base',
      '',
      'A workspace with somewhere to write things down.',
      '',
    ].join('\n'),
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

  test('missing scaffold.console → error finding', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      // Drop scaffold.console from the otherwise-valid config.
      await writeJson(join(tmp, 'pikku.config.json'), {
        srcDirectories: ['packages/functions/src'],
        outDir: 'packages/functions/.pikku',
        clientFiles: {
          rpcMapDeclarationFile:
            'packages/functions-sdk/src/pikku/rpc-map.gen.d.ts',
          reactQueryFile: 'packages/functions-sdk/src/pikku/api.gen.ts',
        },
      })
      const result = await runWorkspaceValidate(tmp)
      const finding = result.findings.find(
        (f) => f.id === 'pikku-config-no-scaffold-console'
      )
      assert.ok(finding, 'expected pikku-config-no-scaffold-console finding')
      assert.strictEqual(finding!.severity, 'error')
      assert.strictEqual(result.ok, false)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('no personas → warn, and ok stays true', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await rm(
        join(tmp, 'packages', 'functions', 'src', 'personas.virtual-user.ts')
      )
      const result = await runWorkspaceValidate(tmp)
      const finding = result.findings.find((f) => f.id === 'no-personas')
      assert.ok(finding, 'expected a no-personas finding')
      assert.strictEqual(finding!.severity, 'warn')
      assert.strictEqual(result.ok, true)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('personas without actor sign-in → warn', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await rm(
        join(tmp, 'packages', 'functions', 'src', 'wirings', 'auth.wiring.ts')
      )
      const result = await runWorkspaceValidate(tmp)
      const finding = result.findings.find(
        (f) => f.id === 'personas-no-actor-sign-in'
      )
      assert.ok(finding, 'expected a personas-no-actor-sign-in finding')
      assert.strictEqual(finding!.severity, 'warn')
      assert.strictEqual(result.ok, true)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('no knowledge base → the shared knowledge checker reports it', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await rm(join(tmp, 'knowledge'), { recursive: true, force: true })
      const result = await runWorkspaceValidate(tmp)
      assert.ok(
        result.findings.some((f) => f.id === 'knowledge-empty'),
        'expected a knowledge-empty finding'
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('@pikku/playwright must be in tsconfig types when it is installed', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await writeJson(join(tmp, 'packages', 'functions', 'package.json'), {
        type: 'module',
        dependencies: { zod: '^4' },
        devDependencies: { '@pikku/playwright': '^0.1.0' },
      })
      await writeJson(join(tmp, 'packages', 'functions', 'tsconfig.json'), {
        compilerOptions: { types: ['node'] },
      })

      const withoutIt = await runWorkspaceValidate(tmp)
      const finding = withoutIt.findings.find(
        (f) => f.id === 'playwright-types-not-loaded'
      )
      assert.ok(finding, 'expected a playwright-types-not-loaded finding')
      assert.strictEqual(finding.severity, 'warn')
      assert.match(finding.fixHint, /"@pikku\/playwright"/)

      await writeJson(join(tmp, 'packages', 'functions', 'tsconfig.json'), {
        compilerOptions: { types: ['node', '@pikku/playwright'] },
      })
      const withIt = await runWorkspaceValidate(tmp)
      assert.ok(
        !withIt.findings.some((f) => f.id === 'playwright-types-not-loaded')
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a tsconfig with no explicit types array is left alone', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await writeJson(join(tmp, 'packages', 'functions', 'package.json'), {
        type: 'module',
        dependencies: { zod: '^4' },
        devDependencies: { '@pikku/playwright': '^0.1.0' },
      })
      await writeJson(join(tmp, 'packages', 'functions', 'tsconfig.json'), {
        compilerOptions: { strict: true },
      })

      const result = await runWorkspaceValidate(tmp)
      assert.ok(
        !result.findings.some((f) => f.id === 'playwright-types-not-loaded'),
        'no types array means the compiler already loads what it resolves'
      )
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
        dependencies: { '@pikku/kysely-postgres': '^1.0.0', zod: '^4' },
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

  test('invalid JSON throws instead of looking missing', async () => {
    const tmp = await makeTmp()
    try {
      const path = join(tmp, 'broken.json')
      await writeFile(path, '{ nope', 'utf8')
      await assert.rejects(
        () => readJsonSafe(path),
        /Invalid JSON in .*broken\.json:/
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('auth middleware requires dev.db and auth tables', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await writeJson(join(tmp, 'pikku.config.json'), {
        srcDirectories: ['packages/functions/src'],
        outDir: 'packages/functions/.pikku',
        clientFiles: {
          rpcMapDeclarationFile:
            'packages/functions-sdk/src/pikku/rpc-map.gen.d.ts',
          reactQueryFile: 'packages/functions-sdk/src/pikku/api.gen.ts',
        },
      })
      await writeFile(
        join(
          tmp,
          'packages',
          'functions',
          '.pikku',
          'middleware',
          'pikku-middleware-groups-meta.gen.json'
        ),
        JSON.stringify(
          {
            definitions: {},
            instances: {
              'http:*:0': { definitionId: 'betterAuthSession' },
            },
            httpGroups: {
              '*': { instanceIds: ['http:*:0'] },
            },
          },
          null,
          2
        ),
        'utf8'
      )

      const result = await runWorkspaceValidate(tmp)
      const ids = result.findings.map((f) => f.id)

      assert.strictEqual(result.ok, false)
      // No db/ assets at all, so `pikku db migrate` has nothing to fall back to.
      assert.ok(ids.includes('auth-dev-db-missing'))
      const missing = result.findings.find(
        (f) => f.id === 'auth-schema-missing-tables'
      )
      assert.ok(missing, 'expected auth-schema-missing-tables')
      for (const table of ['user', 'session', 'account', 'verification']) {
        assert.match(missing!.message, new RegExp(`\\b${table}\\b`))
      }
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('auth middleware with auth migrations passes auth-specific checks', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await writeFile(
        join(tmp, 'packages', 'functions', 'src', 'config.ts'),
        "export const createConfig = () => ({ sqliteDb: '.pikku-runtime/dev.db' })\n",
        'utf8'
      )
      await writeFile(
        join(
          tmp,
          'packages',
          'functions',
          '.pikku',
          'middleware',
          'pikku-middleware-groups-meta.gen.json'
        ),
        JSON.stringify(
          {
            definitions: {},
            instances: {
              'http:*:0': { definitionId: 'betterAuthSession' },
            },
            httpGroups: {
              '*': { instanceIds: ['http:*:0'] },
            },
          },
          null,
          2
        ),
        'utf8'
      )
      await mkdir(join(tmp, 'db', 'sqlite'), { recursive: true })
      await writeFile(
        join(tmp, 'db', 'sqlite', '0001-auth.sql'),
        [
          'CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY);',
          'CREATE TABLE IF NOT EXISTS "session" (id TEXT PRIMARY KEY);',
          'CREATE TABLE IF NOT EXISTS "account" (id TEXT PRIMARY KEY);',
          'CREATE TABLE IF NOT EXISTS "verification" (id TEXT PRIMARY KEY);',
          '',
        ].join('\n'),
        'utf8'
      )

      const result = await runWorkspaceValidate(tmp)
      const ids = result.findings.map((f) => f.id)

      assert.ok(!ids.includes('auth-dev-db-missing'))
      assert.ok(!ids.includes('auth-schema-missing-tables'))
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('custom-server-bootstrap', () => {
  const findBootstrap = (findings: Finding[]) =>
    findings.find((f) => f.id === 'custom-server-bootstrap')

  test('no start or dev script → no finding', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await setRootScripts(tmp, { build: 'tsc' })
      const result = await runWorkspaceValidate(tmp)
      assert.strictEqual(findBootstrap(result.findings), undefined)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('start script booting its own server → warn finding', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await setRootScripts(tmp, { start: 'node dist/start.js' })
      const result = await runWorkspaceValidate(tmp)
      const finding = findBootstrap(result.findings)
      assert.ok(finding, 'expected custom-server-bootstrap finding')
      assert.strictEqual(finding!.severity, 'warn')
      assert.match(finding!.message, /"start"/)
      assert.match(finding!.fixHint, /pikkuServerLifecycle/)
      assert.strictEqual(result.ok, true)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('dev script booting its own server → warn finding', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await setRootScripts(tmp, { dev: 'tsx watch src/server.ts' })
      const result = await runWorkspaceValidate(tmp)
      const finding = findBootstrap(result.findings)
      assert.ok(finding, 'expected custom-server-bootstrap finding')
      assert.match(finding!.message, /"dev"/)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('both scripts custom → one finding naming both', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await setRootScripts(tmp, {
        start: 'node dist/start.js',
        dev: 'tsx watch src/server.ts',
      })
      const result = await runWorkspaceValidate(tmp)
      const matches = result.findings.filter(
        (f) => f.id === 'custom-server-bootstrap'
      )
      assert.strictEqual(matches.length, 1)
      assert.match(matches[0]!.message, /"start", "dev"/)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  for (const script of [
    'pikku serve',
    'pikku serve --port 4077',
    'npx pikku dev',
    'yarn pikku serve --console',
    'pnpm exec pikku dev',
    'bunx pikku serve',
    'NODE_ENV=production pikku serve -p 3000',
    'pikku prebuild && pikku serve',
  ]) {
    test(`"${script}" is recognised as a pikku-owned server`, async () => {
      const tmp = await makeTmp()
      try {
        await makeValidWorkspace(tmp)
        await setRootScripts(tmp, { start: script })
        const result = await runWorkspaceValidate(tmp)
        assert.strictEqual(findBootstrap(result.findings), undefined)
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  }

  for (const script of [
    'turbo run start',
    'yarn workspace @app/functions start',
    'npm run start --workspace=functions',
    'npm-run-all build serve',
  ]) {
    test(`"${script}" delegates, so it is not flagged`, async () => {
      const tmp = await makeTmp()
      try {
        await makeValidWorkspace(tmp)
        await setRootScripts(tmp, { start: script })
        const result = await runWorkspaceValidate(tmp)
        assert.strictEqual(findBootstrap(result.findings), undefined)
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  }

  for (const pkg of [
    '@pikku/express',
    '@pikku/express-middleware',
    '@pikku/fastify',
    '@pikku/uws',
    '@pikku/lambda',
    '@pikku/cloudflare',
    '@pikku/next',
    '@pikku/node-http-server',
    '@pikku/bun-server',
    '@pikku/modelcontextprotocol',
  ]) {
    test(`${pkg} in root deps means the custom entrypoint is intentional`, async () => {
      const tmp = await makeTmp()
      try {
        await makeValidWorkspace(tmp)
        await setRootScripts(
          tmp,
          { start: 'node dist/start.js' },
          { [pkg]: '^1.0.0' }
        )
        const result = await runWorkspaceValidate(tmp)
        assert.strictEqual(findBootstrap(result.findings), undefined)
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    })
  }

  test('a runtime adapter in the functions package also silences it', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await setRootScripts(tmp, { start: 'node dist/start.js' })
      await setFunctionsDeps(tmp, { '@pikku/fastify-plugin': '^1.0.0' })
      const result = await runWorkspaceValidate(tmp)
      assert.strictEqual(findBootstrap(result.findings), undefined)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a non-runtime @pikku package does not silence it', async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await setRootScripts(
        tmp,
        { start: 'node dist/start.js' },
        { '@pikku/jose': '^1.0.0', '@pikku/kysely': '^1.0.0' }
      )
      const result = await runWorkspaceValidate(tmp)
      assert.ok(
        findBootstrap(result.findings),
        'expected custom-server-bootstrap finding'
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test("lint.customServerBootstrap 'off' opts out", async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await setRootScripts(tmp, { start: 'node dist/start.js' })
      await setLintRule(tmp, 'off')
      const result = await runWorkspaceValidate(tmp)
      assert.strictEqual(findBootstrap(result.findings), undefined)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test("lint.customServerBootstrap 'error' fails the run", async () => {
    const tmp = await makeTmp()
    try {
      await makeValidWorkspace(tmp)
      await setRootScripts(tmp, { start: 'node dist/start.js' })
      await setLintRule(tmp, 'error')
      const result = await runWorkspaceValidate(tmp)
      const finding = findBootstrap(result.findings)
      assert.ok(finding, 'expected custom-server-bootstrap finding')
      assert.strictEqual(finding!.severity, 'error')
      assert.strictEqual(result.ok, false)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
