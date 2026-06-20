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
    if (existsSync(join(dir, 'pikkufabric.config.json'))) {
      return dir
    }
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

// Minimum @pikku/* versions Fabric requires. The pikku packages are versioned
// independently (e.g. @pikku/cli moves faster than @pikku/core), so this is a
// per-package floor map, not a single number. Only listed packages are
// enforced — others are skipped to avoid false positives on packages with
// their own (lower) version lines. Bump these as the supported floor moves.
//   - @pikku/cli  < 0.12.43 ships a `pikku dev` that hangs without ever
//     listening (the sandbox never serves routes).
//   - @pikku/core mismatches split pikkuState into duplicate copies, so app
//     and console routes 404; pin the floor that matches the runtime.
const PIKKU_MIN_VERSIONS: Record<string, string> = {
  '@pikku/cli': '0.12.43',
  '@pikku/core': '0.12.34',
}

type Semver = [number, number, number]

// Pull major.minor.patch from a spec, ignoring range prefixes (^ ~ >=),
// npm: aliases, and pre-release/build suffixes. null if no semver is present
// (file:, workspace:, *, latest — resolved only at install time).
function parseSemver(spec: string): Semver | null {
  const m = spec.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
}

function semverLt(a: Semver, b: Semver): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}

// Fall back to the installed version when the spec carries no semver
// (file:/workspace:/* deps resolve to a concrete version on disk).
async function installedSemver(
  root: string,
  pkg: string
): Promise<Semver | null> {
  const j = await readJsonSafe<{ version?: string }>(
    join(root, 'node_modules', pkg, 'package.json')
  )
  return j?.version ? parseSemver(j.version) : null
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
  const lines = (...parts: string[]): string => parts.join('\n')

  // ── pikkufabric.config.json ────────────────────────────────────────────
  // Not required to run validate — downgraded to info so any pikku project
  // can be checked for compatibility before it is linked to a fabric account.
  const fabricConfigPath = join(root, 'pikkufabric.config.json')
  const fabricConfig =
    await readJsonSafe<Record<string, unknown>>(fabricConfigPath)
  if (!fabricConfig) {
    info(
      'fabric-config-missing',
      'pikkufabric.config.json not found — project has not been linked to fabric yet',
      fabricConfigPath,
      lines(
        'Recommended fix:',
        '1. Run `pikku fabric link` if you already have a Fabric project.',
        '2. If you only want to scaffold the file, create:',
        '{',
        '  "projectId": "__PROJECT_ID__"',
        '}',
        '3. Replace `__PROJECT_ID__` later with the real Fabric project id.'
      )
    )
  } else if (!fabricConfig.projectId) {
    info(
      'fabric-config-no-project-id',
      'pikkufabric.config.json is missing "projectId"',
      fabricConfigPath,
      lines(
        'Edit `pikkufabric.config.json` and add:',
        '{',
        '  "projectId": "<your-project-id>"',
        '}',
        'If you do not know the id yet, run `pikku fabric link`.'
      )
    )
  } else if (fabricConfig.projectId === '__PROJECT_ID__') {
    info(
      'fabric-config-placeholder-project-id',
      'pikkufabric.config.json has a placeholder projectId ("__PROJECT_ID__") — project is not linked',
      fabricConfigPath,
      lines(
        'The file exists but still contains the placeholder project id.',
        'Run `pikku fabric link` to replace it automatically, or edit the file and set:',
        '"projectId": "<real-project-id>"'
      )
    )
  }

  // ── root pikku.config.json ─────────────────────────────────────────────
  const pikkuConfigPath = join(root, 'pikku.config.json')
  type PikkuConfig = {
    srcDirectories?: unknown
    outDir?: unknown
    clientFiles?: unknown
    db?: {
      engine?: 'sqlite' | 'postgres'
    }
  }
  const pikkuConfig = await readJsonSafe<PikkuConfig>(pikkuConfigPath)
  if (!pikkuConfig) {
    e(
      'pikku-config-missing',
      'pikku.config.json not found at project root',
      pikkuConfigPath,
      lines(
        'Create `pikku.config.json` at the repo root.',
        'Minimum useful shape:',
        '{',
        '  "srcDirectories": ["packages/functions/src"],',
        '  "outDir": "packages/functions/.pikku",',
        '  "clientFiles": {',
        '    "rpcMapDeclarationFile": "packages/functions-sdk/src/pikku/rpc-map.gen.d.ts",',
        '    "reactQueryFile": "packages/functions-sdk/src/pikku/api.gen.ts"',
        '  }',
        '}'
      )
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
        'pikku.config.json missing "clientFiles" — generated RPC client files and React Query hooks will not be written',
        pikkuConfigPath,
        lines(
          'Add a `clientFiles` block to `pikku.config.json`.',
          'Recommended values:',
          '"clientFiles": {',
          '  "rpcMapDeclarationFile": "packages/functions-sdk/src/pikku/rpc-map.gen.d.ts",',
          '  "reactQueryFile": "packages/functions-sdk/src/pikku/api.gen.ts"',
          '}',
          'Those files should live in `packages/functions-sdk/src/pikku/` and are generated by Pikku.'
        )
      )
    }
  }
  const dbEngine = pikkuConfig?.db?.engine ?? 'sqlite'

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

  // ── @pikku/* minimum versions ──────────────────────────────────────────
  // Scan every workspace manifest for @pikku/* deps below the required floor.
  // A stale @pikku/cli hangs `pikku dev`; a stale @pikku/core duplicates
  // pikkuState and 404s every route — both are hard blockers, so error.
  {
    const manifestPaths = [rootPkgPath]
    for (const group of ['packages', 'apps']) {
      const groupDir = join(root, group)
      if (!existsSync(groupDir)) continue
      try {
        for (const d of await readdir(groupDir, { withFileTypes: true })) {
          if (d.isDirectory()) {
            manifestPaths.push(join(groupDir, d.name, 'package.json'))
          }
        }
      } catch {
        // ignore
      }
    }

    type SeenPikku = { version: Semver; manifest: string; spec: string }
    const lowestByPkg = new Map<string, SeenPikku>()
    for (const mPath of manifestPaths) {
      const m = await readJsonSafe<{
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
      }>(mPath)
      if (!m) continue
      const deps = {
        ...m.dependencies,
        ...m.devDependencies,
        ...m.peerDependencies,
      }
      for (const [pkg, spec] of Object.entries(deps)) {
        if (!pkg.startsWith('@pikku/') || !(pkg in PIKKU_MIN_VERSIONS)) continue
        if (typeof spec !== 'string') continue
        const version = parseSemver(spec) ?? (await installedSemver(root, pkg))
        if (!version) continue
        const prev = lowestByPkg.get(pkg)
        if (!prev || semverLt(version, prev.version)) {
          lowestByPkg.set(pkg, { version, manifest: mPath, spec })
        }
      }
    }

    for (const [pkg, seen] of lowestByPkg) {
      const floorStr = PIKKU_MIN_VERSIONS[pkg]
      const floor = parseSemver(floorStr)
      if (floor && semverLt(seen.version, floor)) {
        e(
          `pikku-version-below-min-${pkg.replace(/[@/]/g, '-')}`,
          `${pkg} is ${seen.version.join('.')} (spec "${seen.spec}") — Fabric requires >= ${floorStr}`,
          seen.manifest,
          lines(
            `Bump ${pkg} to ^${floorStr} (or newer) and reinstall:`,
            `  yarn up ${pkg}@^${floorStr}`,
            'Then run `yarn install` and re-run `pikku fabric validate`.'
          )
        )
      }
    }
  }

  // ── packages/functions/ ────────────────────────────────────────────────
  const fnDir = join(root, 'packages', 'functions')

  // Read local workspace package names for app dependency checks
  type PkgWithName = {
    name?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const functionsSdkPkgName = (
    await readJsonSafe<PkgWithName>(
      join(root, 'packages', 'functions-sdk', 'package.json')
    )
  )?.name
  const themePkgName = (
    await readJsonSafe<PkgWithName>(
      join(root, 'packages', 'mantine-theme', 'package.json')
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
      'Create packages/functions/ as a yarn workspace containing pikku.config.json, src/, and db/sqlite/'
    )
  } else {
    // packages/functions/package.json
    type FnPkg = {
      type?: string
      imports?: Record<string, unknown>
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

      // #pikku bare import — required by the injected fabric-telemetry.wiring.ts
      if (!fnPkg.imports?.['#pikku']) {
        e(
          'functions-pkg-missing-pikku-import',
          'packages/functions/package.json is missing a bare "#pikku" entry in "imports" — the Fabric-injected telemetry middleware imports from "#pikku" and will fail to bundle without it',
          fnPkgPath,
          'Add to "imports": { "#pikku": "./.pikku/pikku-types.gen.ts", "#pikku/*": "./.pikku/*" }'
        )
      }

      const fnAllDeps = {
        ...fnPkg.dependencies,
        ...fnPkg.devDependencies,
        ...fnPkg.peerDependencies,
      }

      if (dbEngine !== 'postgres' && fnAllDeps['@pikku/kysely-postgres']) {
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

      if (dbEngine !== 'postgres' && usesKysely && !usesLibsql) {
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
        dbEngine !== 'postgres' &&
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

    // ── better-auth client baseURL must include the /auth segment ──────────
    // The Fabric deploy edge keeps the /api prefix for the better-auth unit
    // (it registers /api/auth/*) and strips /api only for the other units; the
    // sandbox Caddy mirrors that with a non-stripping /api/auth/* handler. So
    // the DEFAULT basePath (/api/auth) is the CORRECT server config — do NOT
    // override it. The real footgun is the client: better-auth appends the
    // endpoint to baseURL verbatim, so a bare /api baseURL yields
    // /api/sign-in/email (no /auth) and 404s. The client baseURL must resolve
    // to /api/auth.
    const appsDir = join(root, 'apps')
    if (existsSync(appsDir)) {
      try {
        const appFiles = (
          await readdir(appsDir, { recursive: true })
        ).filter(
          (f) =>
            typeof f === 'string' &&
            (f.endsWith('.ts') || f.endsWith('.tsx')) &&
            !f.includes('node_modules')
        ) as string[]
        for (const rel of appFiles) {
          const text = await readTextSafe(join(appsDir, rel))
          if (!text || !/\bcreateAuthClient\s*\(/.test(text)) continue
          const baseURL = text.match(
            /createAuthClient\s*\([^)]*baseURL\s*:\s*([^,)\n]+)/
          )?.[1]
          // Heuristic: flag a bare /api baseURL with no /auth segment anywhere
          // near the client config.
          if (baseURL && /['"`]\/api['"`]/.test(baseURL) && !/auth/i.test(baseURL)) {
            w(
              'better-auth-client-baseurl-missing-auth',
              `createAuthClient baseURL is ${baseURL.trim()} — it omits the /auth segment, so the client calls /api/sign-in/email instead of /api/auth/sign-in/email and auth 404s`,
              join(appsDir, rel),
              "Append the auth basePath: baseURL: `${apiUrl()}/auth` (resolving to /api/auth)"
            )
          }
        }
      } catch {
        // readdir failure — skip
      }
    }

    // Database layout is declared by pikku.config.json db.engine.
    const migrationsDir = join(
      root,
      'db',
      dbEngine === 'postgres' ? 'postgres' : 'sqlite'
    )
    if (!existsSync(migrationsDir)) {
      e(
        'migrations-dir-missing',
        `db/${dbEngine === 'postgres' ? 'postgres' : 'sqlite'}/ not found`,
        migrationsDir,
        dbEngine === 'postgres'
          ? 'Create db/postgres/ and add numbered .sql files (e.g. 0001-init.sql) using PostgreSQL-compatible syntax'
          : 'Create db/sqlite/ and add numbered .sql files (e.g. 0001-init.sql) using SQLite-compatible syntax'
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

        if (dbEngine !== 'postgres') {
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
        }
      } catch {
        // readdir failure — skip
      }
    }

    const seedPath = join(
      root,
      'db',
      dbEngine === 'postgres' ? 'postgres-seed.sql' : 'sqlite-seed.sql'
    )
    if (!existsSync(seedPath)) {
      e(
        'seed-sql-missing',
        dbEngine === 'postgres'
          ? 'db/postgres-seed.sql not found'
          : 'db/sqlite-seed.sql not found',
        seedPath,
        dbEngine === 'postgres'
          ? lines(
              'Create `db/postgres-seed.sql`.',
              'Use idempotent INSERT statements suitable for local/dev/test setup.',
              'Keep it safe to re-run.'
            )
          : lines(
              'Create `db/sqlite-seed.sql`.',
              'Use idempotent `INSERT OR IGNORE` statements for local/dev/test data.',
              'Keep it safe to re-run.'
            )
      )
    }

    // audit table — info if not present (optional feature)
    if (existsSync(migrationsDir)) {
      try {
        const migFiles = (await readdir(migrationsDir)).filter((f) =>
          f.endsWith('.sql')
        )
        const hasAuditTable = (
          await Promise.all(
            migFiles.map((f) => readTextSafe(join(migrationsDir, f)))
          )
        ).some(
          (sql) =>
            sql &&
            /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?audit\b/i.test(sql)
        )

        if (!hasAuditTable) {
          info(
            'audit-table-missing',
            'No migration creates the audit table — Fabric audit events will be dropped',
            migrationsDir,
            lines(
              'Add a new migration in this directory that creates an `audit` table.',
              'Use the starter-template audit migration as the reference shape.',
              'Expected columns come from `AuditEvent`:',
              '- eventId',
              '- type',
              '- source',
              '- outcome',
              '- occurredAt',
              '- functionId',
              '- wireType',
              '- wireId',
              '- traceId',
              '- transactionId',
              '- queryId',
              '- actor',
              '- input',
              '- metadata',
              'At minimum, create the table so Fabric audit writes are not silently dropped.'
            )
          )
        }
      } catch {
        // readdir failure — skip
      }
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
        "Create src/config.ts: export const createConfig = pikkuConfig(async () => ({ sqliteDb: '.pikku-runtime/dev.db' }))"
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

      // The scaffolded dev vite config (generate-frontend-runtime) imports
      // @babel/core to tag JSX with data-om-id for alt-click design editing.
      // It resolves transitively via @vitejs/plugin-react, but that's a silent
      // dependency — declare it explicitly so the resolution can't drift away.
      if (!appPkg.devDependencies?.['@babel/core']) {
        w(
          `app-missing-babel-core-${name}`,
          `apps/${name} does not declare @babel/core — the dev runtime needs it to instrument JSX (data-om-id) for design alt-click`,
          join(appPath, 'package.json'),
          `Add "@babel/core": "^7.26.0" to apps/${name}/package.json devDependencies`
        )
      }
    }
  }

  // ── packages/theme + packages/components ──────────────────────────────
  const designDocUrl = 'https://pikkufabric.dev/docs/design'
  if (!existsSync(join(root, 'packages', 'mantine-theme'))) {
    info(
      'theme-missing',
      'packages/mantine-theme/ not found — Fabric design features require a theme package',
      join(root, 'packages', 'mantine-theme'),
      `Create packages/mantine-theme/ with your Mantine theme tokens. See ${designDocUrl}`
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
      lines(
        'Run `pikku tests init` from the repo root.',
        'That should scaffold `packages/functions/tests/` with the generated function test harness.',
        'Expected contents include feature files, step definitions, and support files.',
        'Commit the scaffolded files after generation.'
      )
    )
  }

  // ── packages/functions-sdk/ ───────────────────────────────────────────
  const sdkDir = join(root, 'packages', 'functions-sdk')
  if (!existsSync(sdkDir)) {
    info(
      'functions-sdk-missing',
      'packages/functions-sdk/ not found — generated RPC client and React Query hooks will not be available',
      sdkDir,
      lines(
        'Create a workspace at `packages/functions-sdk/`.',
        'Minimum structure:',
        '- packages/functions-sdk/package.json',
        '- packages/functions-sdk/src/pikku/',
        'Point `pikku.config.json` clientFiles to:',
        '- packages/functions-sdk/src/pikku/rpc-map.gen.d.ts',
        '- packages/functions-sdk/src/pikku/api.gen.ts',
        'This package is the home for generated client artifacts, not handwritten server code.'
      )
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
    const fixLines = f.fixHint.split('\n')
    console.log(`${icon}  ${f.message}`)
    console.log(`   ${dim('path:')}   ${relPath(f.path)}`)
    console.log(`   ${dim('fix:')}`)
    for (const line of fixLines) {
      console.log(`           ${line}`)
    }
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
