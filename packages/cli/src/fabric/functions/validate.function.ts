import { z } from 'zod'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { added, changed, removed, dim } from '../lib/output.js'

const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  path: z.string(),
  fixHint: z.string(),
})
type Finding = z.infer<typeof FindingSchema>

export const FabricValidateInput = z.object({})

export const FabricValidateOutput = z.object({
  ok: z.boolean(),
  root: z.string(),
  findings: z.array(FindingSchema),
})

async function findProjectRoot(startDir: string): Promise<string> {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, 'fabric.config.json'))) return dir
    if (existsSync(join(dir, 'package.json'))) {
      try {
        const pkg = JSON.parse(
          await readFile(join(dir, 'package.json'), 'utf8')
        )
        if (pkg.workspaces) return dir
      } catch {
        // ignore parse errors
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

async function readJsonSafe<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

async function readTextSafe(path: string): Promise<string | null> {
  if (!existsSync(path)) return null
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

// PostgreSQL-specific syntax that won't work on SQLite/libSQL (Turso)
const POSTGRES_SQL_PATTERNS: Array<{ re: RegExp; label: string }> = [
  {
    re: /\b(?:SMALL|BIG)?SERIAL\b/i,
    label: 'SERIAL / BIGSERIAL / SMALLSERIAL',
  },
  { re: /\bJSONB\b/i, label: 'JSONB' },
  { re: /\bCREATE\s+SEQUENCE\b/i, label: 'CREATE SEQUENCE' },
  { re: /\bgen_random_uuid\s*\(\s*\)/i, label: 'gen_random_uuid()' },
  { re: /::[a-z_]+/i, label: ':: type cast' },
  { re: /\bTSVECTOR\b/i, label: 'TSVECTOR' },
  { re: /\bARRAY\s*\[/i, label: 'ARRAY[…]' },
]

export async function runValidate(
  startDir = process.cwd()
): Promise<z.infer<typeof FabricValidateOutput>> {
  const root = await findProjectRoot(startDir)
  const findings: Finding[] = []

  const e = (
    id: string,
    message: string,
    path: string,
    fixHint: string
  ): void => {
    findings.push({ id, severity: 'error', message, path, fixHint })
  }
  const w = (
    id: string,
    message: string,
    path: string,
    fixHint: string
  ): void => {
    findings.push({ id, severity: 'warn', message, path, fixHint })
  }
  const info = (
    id: string,
    message: string,
    path: string,
    fixHint: string
  ): void => {
    findings.push({ id, severity: 'info', message, path, fixHint })
  }

  // ── fabric.config.json ─────────────────────────────────────────────────
  // Not required to run validate — downgraded to info so any pikku project
  // can be checked for compatibility before it is linked to a fabric account.
  const fabricConfigPath = join(root, 'fabric.config.json')
  const fabricConfig =
    await readJsonSafe<Record<string, unknown>>(fabricConfigPath)
  if (!fabricConfig) {
    info(
      'fabric-config-missing',
      'fabric.config.json not found — project has not been linked to fabric yet',
      fabricConfigPath,
      'Run `pikku fabric link` to create it, or create manually: {"projectId": "__PROJECT_ID__"}'
    )
  } else if (!fabricConfig.projectId) {
    info(
      'fabric-config-no-project-id',
      'fabric.config.json is missing "projectId"',
      fabricConfigPath,
      'Add "projectId": "<your-project-id>" to fabric.config.json, or run `pikku fabric link`'
    )
  } else if (fabricConfig.projectId === '__PROJECT_ID__') {
    info(
      'fabric-config-placeholder-project-id',
      'fabric.config.json has a placeholder projectId ("__PROJECT_ID__") — project is not linked',
      fabricConfigPath,
      'Run `pikku fabric link` to replace the placeholder with a real project ID'
    )
  }

  // ── root pikku.config.json ─────────────────────────────────────────────
  const pikkuConfigPath = join(root, 'pikku.config.json')
  const pikkuConfig =
    await readJsonSafe<Record<string, unknown>>(pikkuConfigPath)
  if (!pikkuConfig) {
    e(
      'pikku-config-missing',
      'pikku.config.json not found at project root',
      pikkuConfigPath,
      'Create pikku.config.json with srcDirectories pointing to packages/functions/src, outDir, and clientFiles'
    )
  } else {
    if (!pikkuConfig.srcDirectories) {
      e(
        'pikku-config-no-src-dirs',
        'pikku.config.json missing "srcDirectories"',
        pikkuConfigPath,
        'Add "srcDirectories": ["packages/functions/src"] to pikku.config.json'
      )
    }
    if (!pikkuConfig.outDir) {
      e(
        'pikku-config-no-out-dir',
        'pikku.config.json missing "outDir"',
        pikkuConfigPath,
        'Add "outDir": "packages/functions/.pikku" to pikku.config.json'
      )
    }
    if (!pikkuConfig.clientFiles) {
      info(
        'pikku-config-no-client-files',
        'pikku.config.json missing "clientFiles" — no generated SDK or React Query hooks',
        pikkuConfigPath,
        'Add clientFiles.rpcMapDeclarationFile and clientFiles.reactQueryFile pointing to packages/functions-sdk/src/pikku/'
      )
    }
  }

  // ── root package.json ──────────────────────────────────────────────────
  type RootPkg = {
    workspaces?: unknown
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const rootPkgPath = join(root, 'package.json')
  const rootPkg = await readJsonSafe<RootPkg>(rootPkgPath)
  if (!rootPkg) {
    e(
      'root-package-missing',
      'root package.json not found',
      rootPkgPath,
      'Create a root package.json with workspaces: {"workspaces": ["packages/*", "apps/*"]}'
    )
  } else {
    if (!rootPkg.workspaces) {
      w(
        'root-package-no-workspaces',
        'root package.json missing "workspaces"',
        rootPkgPath,
        'Add "workspaces": ["packages/*", "apps/*"] to enable yarn workspaces'
      )
    }

    const allDeps = {
      ...rootPkg.dependencies,
      ...rootPkg.devDependencies,
    }

    if (!allDeps['@pikku/fabric-cli']) {
      info(
        'missing-fabric-cli',
        '@pikku/fabric-cli not in devDependencies — fabric CLI commands (validate, deploy) will not be available',
        rootPkgPath,
        'Add "@pikku/fabric-cli" to devDependencies: use "file:./vendor/pikku-fabric-cli.tgz" (bundled release) or "portal:/path/to/pikku/packages/fabric-cli" (local dev)'
      )
    }

    if (!allDeps['@pikku/core']) {
      e(
        'missing-core',
        '@pikku/core not in dependencies',
        rootPkgPath,
        'Add "@pikku/core": "file:./vendor/pikku-core.tgz" to dependencies'
      )
    }

    // Vendor tgz presence — only check file: deps that reference a vendor/ path
    for (const [pkg, spec] of Object.entries(allDeps)) {
      if (typeof spec !== 'string' || !spec.startsWith('file:')) continue
      const relPath = spec.slice(5) // strip 'file:'
      if (!relPath.includes('vendor')) continue
      const absPath = join(root, relPath)
      if (!existsSync(absPath)) {
        w(
          `vendor-missing-${pkg.replace(/[@/]/g, '-')}`,
          `Vendor file missing for ${pkg}: ${relPath}`,
          absPath,
          `Run \`pikku pack\` in the pikku source repo and copy the output to ${relPath}`
        )
      }
    }
  }

  // ── packages/functions/ ────────────────────────────────────────────────
  const fnDir = join(root, 'packages', 'functions')

  // Read local workspace package names for app dependency checks
  type PkgWithName = { name?: string; dependencies?: Record<string, string> }
  const functionsSdkPkgName = (
    await readJsonSafe<PkgWithName>(
      join(root, 'packages', 'functions-sdk', 'package.json')
    )
  )?.name
  const themePkgName = (
    await readJsonSafe<PkgWithName>(
      join(root, 'packages', 'theme', 'package.json')
    )
  )?.name
  const componentsPkgName = (
    await readJsonSafe<PkgWithName>(
      join(root, 'packages', 'components', 'package.json')
    )
  )?.name

  if (!existsSync(fnDir)) {
    e(
      'functions-pkg-missing',
      'packages/functions/ directory not found',
      fnDir,
      'Create packages/functions/ as a yarn workspace containing pikku.config.json, src/, and db/migrations/'
    )
  } else {
    // packages/functions/package.json
    type FnPkg = {
      type?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const fnPkgPath = join(fnDir, 'package.json')
    const fnPkg = await readJsonSafe<FnPkg>(fnPkgPath)
    if (fnPkg) {
      if (fnPkg.type !== 'module') {
        w(
          'functions-pkg-no-esm',
          'packages/functions/package.json is missing "type": "module"',
          fnPkgPath,
          'Add "type": "module" to packages/functions/package.json — Cloudflare Workers require ES modules'
        )
      }

      const fnAllDeps = {
        ...fnPkg.dependencies,
        ...fnPkg.devDependencies,
        ...fnPkg.peerDependencies,
      }

      if (fnAllDeps['@pikku/kysely-postgres']) {
        e(
          'fn-pkg-postgres-dep',
          '@pikku/kysely-postgres is in packages/functions dependencies — Fabric uses SQLite/libSQL (Turso), not PostgreSQL',
          fnPkgPath,
          'Remove @pikku/kysely-postgres and use @pikku/kysely-sqlite with LibsqlWebDialect instead'
        )
      }
    }

    // services.ts
    const servicesPath = join(fnDir, 'src', 'services.ts')
    const servicesText = await readTextSafe(servicesPath)
    if (!servicesText) {
      w(
        'services-missing',
        'packages/functions/src/services.ts not found',
        servicesPath,
        'Create services.ts using pikkuServices() with LibsqlWebDialect from @pikku/kysely-sqlite — fabric injects DATABASE_URL at runtime'
      )
    } else {
      const usesKysely = /\bKysely\b/.test(servicesText)
      const usesLibsql =
        servicesText.includes('@pikku/kysely-sqlite') ||
        servicesText.includes('LibsqlWebDialect')
      const usesProcessEnv = /\bprocess\.env\.[A-Z_]/.test(servicesText)

      if (usesKysely && !usesLibsql) {
        e(
          'services-wrong-db-adapter',
          'services.ts uses Kysely but not LibsqlWebDialect — Fabric injects a Turso/libSQL DATABASE_URL at runtime, not a PostgreSQL URL',
          servicesPath,
          'Import LibsqlWebDialect from @pikku/kysely-sqlite and replace the dialect: new Kysely({ dialect: new LibsqlWebDialect({ url: databaseUrl }) })'
        )
      }

      if (usesProcessEnv) {
        info(
          'services-process-env',
          'services.ts reads process.env directly — prefer variables.get() for portable secret/variable access',
          servicesPath,
          'Replace process.env.SOME_VAR with await variables.get("SOME_VAR") — declare the binding with wireVariable/wireSecret; process.env is fine for optional/non-secret config'
        )
      }

      if (
        usesLibsql &&
        rootPkg &&
        !rootPkg.dependencies?.['@pikku/kysely-sqlite'] &&
        !rootPkg.devDependencies?.['@pikku/kysely-sqlite']
      ) {
        e(
          'missing-kysely-sqlite',
          'services.ts imports @pikku/kysely-sqlite but it is not in root package.json',
          rootPkgPath,
          'Add "@pikku/kysely-sqlite": "file:./vendor/pikku-kysely-sqlite.tgz" to dependencies'
        )
      }
    }

    // db/migrations/ — presence, numbering and SQL dialect
    const migrationsDir = join(fnDir, 'db', 'migrations')
    if (!existsSync(migrationsDir)) {
      e(
        'migrations-dir-missing',
        'packages/functions/db/migrations/ not found',
        migrationsDir,
        'Create db/migrations/ and add numbered .sql files (e.g. 0001-init.sql) using SQLite-compatible syntax'
      )
    } else {
      try {
        const files = (await readdir(migrationsDir))
          .filter((f) => f.endsWith('.sql'))
          .sort()
        const nums: number[] = []
        for (const f of files) {
          const m = f.match(/^(\d+)/)
          if (m) nums.push(parseInt(m[1], 10))
        }
        for (let idx = 1; idx < nums.length; idx++) {
          if (nums[idx] !== nums[idx - 1] + 1) {
            const missing = `${nums[idx - 1] + 1}..${nums[idx] - 1}`
            e(
              'migration-gap',
              `Migration numbering gap: IDs ${missing} are missing`,
              migrationsDir,
              'Migrations must be consecutive. Add the missing .sql file or renumber if not yet applied.'
            )
            break
          }
        }

        // Check for PostgreSQL-specific syntax — Fabric uses Turso (SQLite/libSQL)
        for (const f of files) {
          const sql = await readTextSafe(join(migrationsDir, f))
          if (!sql) continue
          const hits = POSTGRES_SQL_PATTERNS.filter(({ re }) =>
            re.test(sql)
          ).map(({ label }) => label)
          if (hits.length > 0) {
            e(
              `migration-postgres-sql-${f.replace(/[^a-z0-9]/gi, '-')}`,
              `${f} contains PostgreSQL syntax (${hits.join(', ')}) — Fabric uses SQLite/libSQL (Turso)`,
              join(migrationsDir, f),
              "Rewrite the migration using SQLite-compatible syntax: TEXT instead of JSONB, INTEGER PRIMARY KEY for auto-increment, datetime('now') instead of NOW(), no :: casts"
            )
          }
        }
      } catch {
        // readdir failure — skip
      }
    }

    // db/seed.sql
    const seedPath = join(fnDir, 'db', 'seed.sql')
    if (!existsSync(seedPath)) {
      e(
        'seed-sql-missing',
        'packages/functions/db/seed.sql not found',
        seedPath,
        'Create db/seed.sql with idempotent INSERT OR IGNORE statements for demo/test data'
      )
    }

    // db.types.ts — should only re-export from .pikku
    const dbTypesPath = join(fnDir, 'src', 'types', 'db.types.ts')
    const dbTypesText = await readTextSafe(dbTypesPath)
    if (dbTypesText) {
      const isReexport =
        dbTypesText.includes('.pikku/db/schema') ||
        dbTypesText.includes('.pikku\\db\\schema')
      const hasInlineTypes =
        /(?:^|\n)\s*(?:export\s+)?(?:interface\s+\w|type\s+\w+\s*=)/.test(
          dbTypesText
        )
      if (hasInlineTypes && !isReexport) {
        w(
          'db-types-hand-edited',
          'src/types/db.types.ts contains inline type definitions — it should only re-export from .pikku',
          dbTypesPath,
          "Replace the file with a single line: export type { DB } from '../../.pikku/db/schema.js' then run `yarn db:types` to regenerate"
        )
      }
    }

    // Structure: src/functions/, src/wirings/, src/config.ts
    if (!existsSync(join(fnDir, 'src', 'functions'))) {
      info(
        'functions-dir-missing',
        'packages/functions/src/functions/ not found',
        join(fnDir, 'src', 'functions'),
        'Create src/functions/ to hold pikkuSessionlessFunc definitions (one function per file)'
      )
    }

    if (!existsSync(join(fnDir, 'src', 'wirings'))) {
      info(
        'wirings-dir-missing',
        'packages/functions/src/wirings/ not found',
        join(fnDir, 'src', 'wirings'),
        'Create src/wirings/ for transport bindings: *.http.ts, *.queue.ts, *.schedule.ts, *.channel.ts, *.cli.ts'
      )
    }

    if (!existsSync(join(fnDir, 'src', 'config.ts'))) {
      info(
        'config-missing',
        'packages/functions/src/config.ts not found',
        join(fnDir, 'src', 'config.ts'),
        'Create src/config.ts: export const createConfig = pikkuConfig(async () => ({ dev: { db: true } }))'
      )
    }
  }

  // ── apps/ vs fabric.config.json frontends ─────────────────────────────
  const appsDir = join(root, 'apps')

  if (existsSync(appsDir)) {
    type FrontendEntry = { cwd?: string }

    // Check declared frontends have a real directory on disk
    if (fabricConfig) {
      const frontends = (fabricConfig.frontends ?? {}) as Record<
        string,
        FrontendEntry
      >
      for (const [slug, fe] of Object.entries(frontends)) {
        const cwd = fe.cwd?.replace(/^\.\//, '')
        if (cwd && !existsSync(join(root, cwd))) {
          e(
            `frontend-cwd-missing-${slug}`,
            `fabric.config.json frontend "${slug}" declares cwd "${cwd}" but that directory does not exist`,
            join(root, cwd),
            `Create the directory or update the cwd in fabric.config.json`
          )
        }
      }
    }

    // Check each app/ subdir is declared and has correct local deps
    let appEntries: string[] = []
    try {
      appEntries = (await readdir(appsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      /* ignore */
    }

    const declaredCwds = fabricConfig
      ? new Set(
          Object.values(
            (fabricConfig.frontends ?? {}) as Record<string, FrontendEntry>
          ).map((f) => f.cwd?.replace(/^\.\//, '') ?? '')
        )
      : null

    for (const name of appEntries) {
      const appPath = join(appsDir, name)
      const cwd = `apps/${name}`

      if (declaredCwds && !declaredCwds.has(cwd)) {
        w(
          `app-not-declared-${name}`,
          `apps/${name} is not declared in fabric.config.json frontends`,
          appPath,
          `Add an entry to fabric.config.json: { "frontends": { "${name}": { "cwd": "${cwd}", "kind": "ssr" } } }`
        )
      }

      const appPkg = await readJsonSafe<PkgWithName>(
        join(appPath, 'package.json')
      )
      if (!appPkg) continue
      const appDeps = { ...appPkg.dependencies }

      if (functionsSdkPkgName && !appDeps[functionsSdkPkgName]) {
        info(
          `app-missing-functions-sdk-${name}`,
          `apps/${name} does not depend on ${functionsSdkPkgName} — the generated RPC client and React Query hooks`,
          join(appPath, 'package.json'),
          `Add "${functionsSdkPkgName}: workspace:*" to apps/${name}/package.json dependencies`
        )
      }

      if (themePkgName && !appDeps[themePkgName]) {
        info(
          `app-missing-theme-${name}`,
          `apps/${name} does not depend on ${themePkgName}`,
          join(appPath, 'package.json'),
          `Add "${themePkgName}: workspace:*" to apps/${name}/package.json dependencies`
        )
      }

      if (componentsPkgName && !appDeps[componentsPkgName]) {
        info(
          `app-missing-components-${name}`,
          `apps/${name} does not depend on ${componentsPkgName}`,
          join(appPath, 'package.json'),
          `Add "${componentsPkgName}: workspace:*" to apps/${name}/package.json dependencies`
        )
      }
    }
  }

  // ── packages/theme + packages/components ──────────────────────────────
  const designDocUrl = 'https://pikkufabric.dev/docs/design'
  if (!existsSync(join(root, 'packages', 'theme'))) {
    info(
      'theme-missing',
      'packages/theme/ not found — Fabric design features require a theme package',
      join(root, 'packages', 'theme'),
      `Create packages/theme/ with your Mantine theme tokens. See ${designDocUrl}`
    )
  }
  if (!existsSync(join(root, 'packages', 'components'))) {
    info(
      'components-missing',
      'packages/components/ not found — Fabric design features require a components package',
      join(root, 'packages', 'components'),
      `Create packages/components/ with your shared UI components. See ${designDocUrl}`
    )
  }

  // ── packages/functions/tests/ ─────────────────────────────────────────
  const testsDir = join(fnDir, 'tests')
  if (!existsSync(testsDir)) {
    info(
      'tests-missing',
      'packages/functions/tests/ not found — no function test harness',
      testsDir,
      'Run `pikku tests init` to scaffold the Cucumber test harness under packages/functions/tests/'
    )
  }

  // ── packages/functions-sdk/ ───────────────────────────────────────────
  const sdkDir = join(root, 'packages', 'functions-sdk')
  if (!existsSync(sdkDir)) {
    info(
      'functions-sdk-missing',
      'packages/functions-sdk/ not found — generated RPC client and React Query hooks will not be available',
      sdkDir,
      'Create packages/functions-sdk/ as a workspace with src/pikku/ subdirectory; configure clientFiles in root pikku.config.json to point to packages/functions-sdk/src/pikku/'
    )
  }

  const ok = !findings.some((f) => f.severity === 'error')
  return { ok, root, findings }
}

export const FabricValidate = pikkuSessionlessFunc({
  description:
    'Check the current project structure for fabric compatibility. Prints all missing or misconfigured items with fix hints so an AI agent or developer can resolve them.',
  input: FabricValidateInput,
  output: FabricValidateOutput,
  func: async (_services) => runValidate(),
})

export const renderValidate = (
  _s: unknown,
  { ok, root, findings }: z.infer<typeof FabricValidateOutput>
): void => {
  if (findings.length === 0) {
    console.log(added('✓  All checks passed — project is fabric-compatible'))
    return
  }

  const relPath = (p: string): string =>
    p.startsWith(root + '/') || p.startsWith(root + '\\')
      ? p.slice(root.length + 1)
      : p

  const errors = findings.filter((f) => f.severity === 'error')
  const warns = findings.filter((f) => f.severity === 'warn')
  const infos = findings.filter((f) => f.severity === 'info')

  for (const f of [...errors, ...warns, ...infos]) {
    const icon =
      f.severity === 'error'
        ? removed('✗')
        : f.severity === 'warn'
          ? changed('⚠')
          : dim('ℹ')
    console.log(`${icon}  ${f.message}`)
    console.log(`   ${dim('path:')}   ${relPath(f.path)}`)
    console.log(`   ${dim('fix:')}    ${f.fixHint}`)
    console.log()
  }

  const counts: string[] = []
  if (errors.length)
    counts.push(
      removed(`${errors.length} error${errors.length !== 1 ? 's' : ''}`)
    )
  if (warns.length)
    counts.push(
      changed(`${warns.length} warning${warns.length !== 1 ? 's' : ''}`)
    )
  if (infos.length) counts.push(dim(`${infos.length} info`))

  console.log('─'.repeat(40))
  console.log(counts.join('  '))
  if (ok) {
    console.log()
    console.log(
      added('✓') + '  ' + dim('no errors — project can be linked to fabric')
    )
  }
}
