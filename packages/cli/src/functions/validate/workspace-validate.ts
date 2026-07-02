import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { added, changed, dim, removed } from '../../fabric/lib/output.js'

export const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  path: z.string(),
  fixHint: z.string(),
})

export type Finding = z.infer<typeof FindingSchema>

export const WorkspaceValidateInput = z.object({})

export const WorkspaceValidateOutput = z.object({
  ok: z.boolean(),
  root: z.string(),
  findings: z.array(FindingSchema),
})

export async function findProjectRoot(startDir: string): Promise<string> {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, 'package.json'))) {
      try {
        const pkg = JSON.parse(
          await readFile(join(dir, 'package.json'), 'utf8')
        ) as { workspaces?: unknown }
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

export async function readJsonSafe<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON in ${path}: ${message}`)
  }
}

export async function readTextSafe(path: string): Promise<string | null> {
  if (!existsSync(path)) return null
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

type MiddlewareGroupsMeta = {
  instances?: Record<string, { definitionId?: string }>
}

async function hasAuthSessionMiddleware(fnDir: string): Promise<boolean> {
  const metaPath = join(
    fnDir,
    '.pikku',
    'middleware',
    'pikku-middleware-groups-meta.gen.json'
  )
  const meta = await readJsonSafe<MiddlewareGroupsMeta>(metaPath)
  if (!meta?.instances) return false
  return Object.values(meta.instances).some(
    (instance) => instance.definitionId === 'betterAuthSession'
  )
}

function migrationCreatesTable(sql: string, tableName: string): boolean {
  const escapedTable = tableName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const re = new RegExp(
    `\\bcreate\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?["'\`]?${escapedTable}["'\`]?\\b`,
    'i'
  )
  return re.test(sql)
}

export async function runWorkspaceValidate(
  startDir = process.cwd()
): Promise<z.infer<typeof WorkspaceValidateOutput>> {
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
        'pikku.config.json missing "clientFiles" — generated RPC client files and React Query hooks will not be written',
        pikkuConfigPath,
        'Add clientFiles.rpcMapDeclarationFile and clientFiles.reactQueryFile pointing to packages/functions-sdk/src/pikku/ (for example: rpc-map.gen.d.ts and api.gen.ts)'
      )
    }
    const scaffold = pikkuConfig.scaffold as { console?: unknown } | undefined
    if (!scaffold?.console) {
      e(
        'pikku-config-no-console-scaffold',
        'pikku.config.json missing "scaffold.console" — Fabric cannot introspect the running app (console:getFunctionsMeta and friends 404), so the sandbox builder shows no functions',
        pikkuConfigPath,
        'Add "console": "auth" under "scaffold" in pikku.config.json — the console requires an authenticated session, so Better Auth must be set up (see the pikku-better-auth skill)'
      )
    }
  }

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
        'Add "@pikku/core" to dependencies'
      )
    }

    for (const [pkg, spec] of Object.entries(allDeps)) {
      if (typeof spec !== 'string' || !spec.startsWith('file:')) continue
      const relPath = spec.slice(5)
      if (!relPath.includes('vendor')) continue
      const absPath = join(root, relPath)
      if (!existsSync(absPath)) {
        w(
          `vendor-missing-${pkg.replace(/[@/]/g, '-')}`,
          `Vendor file missing for ${pkg}: ${relPath}`,
          absPath,
          `Restore or replace the missing vendor package at ${relPath}`
        )
      }
    }
  }

  const fnDir = join(root, 'packages', 'functions')
  if (!existsSync(fnDir)) {
    e(
      'functions-pkg-missing',
      'packages/functions/ directory not found',
      fnDir,
      'Create packages/functions/ as a workspace containing src/, tests/, config.ts, and any local db assets you use'
    )
  } else {
    type FnPkg = {
      type?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const fnPkgPath = join(fnDir, 'package.json')
    const fnPkg = await readJsonSafe<FnPkg>(fnPkgPath)
    if (!fnPkg) {
      e(
        'functions-package-json-missing',
        'packages/functions/package.json not found',
        fnPkgPath,
        'Create packages/functions/package.json and declare the workspace package'
      )
    } else if (fnPkg.type !== 'module') {
      w(
        'functions-pkg-no-esm',
        'packages/functions/package.json is missing "type": "module"',
        fnPkgPath,
        'Add "type": "module" to packages/functions/package.json'
      )
    }

    // zod v4 must be installed in the functions package: pikku's generated
    // schemas and the auth scaffold (auth-secrets.gen.ts) both `import { z }
    // from 'zod'`, so a missing/old zod fails codegen (PKU489) or type-checks.
    if (fnPkg) {
      const fnDeps = { ...fnPkg.dependencies, ...fnPkg.devDependencies }
      const zodRange = fnDeps.zod
      const zodMajor = zodRange?.match(/(\d+)/)?.[1]
      if (!zodRange) {
        e(
          'functions-missing-zod',
          'packages/functions/package.json does not declare "zod" — pikku schemas and the generated auth scaffold import it',
          fnPkgPath,
          'Add "zod": "^4" to packages/functions dependencies'
        )
      } else if (zodMajor !== '4') {
        e(
          'functions-zod-not-v4',
          `packages/functions requires zod v4 but found "${zodRange}"`,
          fnPkgPath,
          'Set "zod": "^4" in packages/functions dependencies'
        )
      }
    }

    const servicesPath = join(fnDir, 'src', 'services.ts')
    const servicesText = await readTextSafe(servicesPath)
    if (!servicesText) {
      w(
        'services-missing',
        'packages/functions/src/services.ts not found',
        servicesPath,
        'Create services.ts and export your service factory for the workspace'
      )
    }

    const authEnabled = await hasAuthSessionMiddleware(fnDir)
    const configText = await readTextSafe(join(fnDir, 'src', 'config.ts'))
    const hasConfiguredDevDb = /sqliteDb/.test(configText ?? '')
    const hasPostgresUrl = /postgresUrl/.test(configText ?? '')
    const migrationsDir = hasPostgresUrl
      ? join(fnDir, 'db', 'postgres')
      : join(fnDir, 'db', 'sqlite')
    let createsAppUser = false
    let createsAuthVerificationToken = false
    if (existsSync(migrationsDir)) {
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
        for (const f of files) {
          const sql = await readTextSafe(join(migrationsDir, f))
          if (!sql) continue
          createsAppUser ||= migrationCreatesTable(sql, 'app_user')
          createsAuthVerificationToken ||= migrationCreatesTable(
            sql,
            'auth_verification_token'
          )
        }
      } catch {
        // readdir failure — skip
      }
    }

    if (authEnabled && !hasConfiguredDevDb) {
      e(
        'auth-dev-db-missing',
        'Auth middleware is registered, but createConfig is missing sqliteDb so local auth schema validation and db migrate cannot run',
        pikkuConfigPath,
        'Add sqliteDb to createConfig so `pikku db migrate` can create and validate the local auth schema'
      )
    }

    if (authEnabled && !createsAppUser) {
      e(
        'auth-schema-missing-app-user',
        'Auth middleware is registered, but no SQL migration creates the app_user table',
        migrationsDir,
        'Add a migration that creates app_user before enabling auth'
      )
    }

    if (authEnabled && !createsAuthVerificationToken) {
      e(
        'auth-schema-missing-verification-token',
        'Auth middleware is registered, but no SQL migration creates the auth_verification_token table',
        migrationsDir,
        'Add a migration that creates auth_verification_token before enabling auth'
      )
    }

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
          "Replace the file with a single line: export type { DB } from '../../.pikku/db/schema.gen.js' then regenerate"
        )
      }
    }

    if (!existsSync(join(fnDir, 'src', 'functions'))) {
      info(
        'functions-dir-missing',
        'packages/functions/src/functions/ not found',
        join(fnDir, 'src', 'functions'),
        'Create src/functions/ to hold pikkuSessionlessFunc definitions'
      )
    }

    if (!existsSync(join(fnDir, 'src', 'wirings'))) {
      info(
        'wirings-dir-missing',
        'packages/functions/src/wirings/ not found',
        join(fnDir, 'src', 'wirings'),
        'Create src/wirings/ for transport bindings such as *.http.ts or *.queue.ts'
      )
    }

    if (!existsSync(join(fnDir, 'src', 'config.ts'))) {
      info(
        'config-missing',
        'packages/functions/src/config.ts not found',
        join(fnDir, 'src', 'config.ts'),
        'Create src/config.ts and export your workspace config factory'
      )
    }
  }

  const testsDir = join(fnDir, 'tests')
  if (!existsSync(testsDir)) {
    info(
      'tests-missing',
      'packages/functions/tests/ not found — no function test harness',
      testsDir,
      'Run `pikku tests init` to scaffold the generated function test harness under packages/functions/tests/ (feature files, step defs, and support files)'
    )
  }

  const sdkDir = join(root, 'packages', 'functions-sdk')
  if (!existsSync(sdkDir)) {
    info(
      'functions-sdk-missing',
      'packages/functions-sdk/ not found — generated RPC client and React Query hooks will not be available',
      sdkDir,
      'Create packages/functions-sdk/ as a workspace with src/pikku/ as the generated output root; point clientFiles.rpcMapDeclarationFile and clientFiles.reactQueryFile there'
    )
  }

  const ok = !findings.some((f) => f.severity === 'error')
  return { ok, root, findings }
}

export const renderWorkspaceValidate = (
  _s: unknown,
  { ok, root, findings }: z.infer<typeof WorkspaceValidateOutput>
): void => {
  if (findings.length === 0) {
    console.log(added('✓  All checks passed — workspace is Pikku-compatible'))
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
      added('✓') + '  ' + dim('no errors — workspace is structurally sound')
    )
  }
}
