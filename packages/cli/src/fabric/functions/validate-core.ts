import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { added, changed, dim, removed } from '../lib/output.js'
import {
  WorkspaceValidateOutput,
  readJsonSafe,
  readTextSafe,
  runWorkspaceValidate,
} from '../../functions/validate/workspace-validate.js'
import type { Finding } from '../../functions/validate/workspace-validate.js'

export const FabricValidateInput = z.object({})
export const FabricValidateOutput = WorkspaceValidateOutput

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

export async function runFabricValidate(
  startDir = process.cwd()
): Promise<z.infer<typeof FabricValidateOutput>> {
  const workspaceResult = await runWorkspaceValidate(startDir)
  const root = workspaceResult.root
  const findings: Finding[] = [...workspaceResult.findings]

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

  type RootPkg = {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const rootPkgPath = join(root, 'package.json')
  const rootPkg = await readJsonSafe<RootPkg>(rootPkgPath)
  if (rootPkg) {
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
  }

  const fnDir = join(root, 'packages', 'functions')

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

  if (existsSync(fnDir)) {
    type FnPkg = {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const fnPkgPath = join(fnDir, 'package.json')
    const fnPkg = await readJsonSafe<FnPkg>(fnPkgPath)
    if (fnPkg) {
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

    const servicesPath = join(fnDir, 'src', 'services.ts')
    const servicesText = await readTextSafe(servicesPath)
    if (servicesText) {
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
        const files = (await readdir(migrationsDir)).filter((f) =>
          f.endsWith('.sql')
        )
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

    const seedPath = join(fnDir, 'db', 'seed.sql')
    if (!existsSync(seedPath)) {
      e(
        'seed-sql-missing',
        'packages/functions/db/seed.sql not found',
        seedPath,
        'Create db/seed.sql with idempotent INSERT OR IGNORE statements for demo/test data'
      )
    }
  }

  const appsDir = join(root, 'apps')
  if (existsSync(appsDir)) {
    type FrontendEntry = { cwd?: string }

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
            'Create the directory or update the cwd in fabric.config.json'
          )
        }
      }
    }

    let appEntries: string[] = []
    try {
      appEntries = (await readdir(appsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      // ignore
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

  const ok = !findings.some((f) => f.severity === 'error')
  return { ok, root, findings }
}

export const runValidate = runFabricValidate

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
  if (errors.length) {
    counts.push(
      removed(`${errors.length} error${errors.length !== 1 ? 's' : ''}`)
    )
  }
  if (warns.length) {
    counts.push(
      changed(`${warns.length} warning${warns.length !== 1 ? 's' : ''}`)
    )
  }
  if (infos.length) {
    counts.push(dim(`${infos.length} info${infos.length !== 1 ? 's' : ''}`))
  }

  console.log('─'.repeat(40))
  console.log(counts.join('  '))
  if (ok) {
    console.log()
    console.log(
      added('✓') + '  ' + dim('no errors — project can be linked to fabric')
    )
  }
}
