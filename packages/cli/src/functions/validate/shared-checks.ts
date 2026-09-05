import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { runKnowledgeValidate } from '@pikku/knowledge'
import { runBootstrapChecks } from './bootstrap-checks.js'
import { runPersonaChecks, type ValidateFinding } from './persona-checks.js'
import { runAuthPluginChecks } from './auth-plugin-checks.js'
import { runScenarioFileChecks } from './scenario-file-checks.js'
import {
  projectWiresChannels,
  runWebsocketDepsChecks,
} from './websocket-deps-checks.js'
import { resolveFromProject } from '../../utils/resolve-from-project.js'
import { SERVICE_MODULE_MAP } from '../../deploy/bundler/service-module-map.js'

export type Finding = ValidateFinding

export type SharedPikkuConfig = {
  srcDirectories?: unknown
  outDir?: unknown
  environments?: unknown
  clientFiles?: unknown
  scaffold?: {
    console?: unknown
    rpc?: unknown
    agent?: unknown
    workflow?: unknown
    events?: unknown
    remoteRpc?: unknown
  }
  db?: {
    engine?: 'sqlite' | 'postgres'
  }
  lint?: {
    customServerBootstrap?: 'off' | 'warn' | 'error'
  }
}

export type SharedFnPkg = {
  type?: string
  imports?: Record<string, unknown>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export type SharedCheckResult = {
  findings: Finding[]
  /** Read once here and handed back, so a caller never parses these twice. */
  pikkuConfig: SharedPikkuConfig | null
  fnPkg: SharedFnPkg | null
  fnDir: string
  dbEngine: 'sqlite' | 'postgres'
  migrationsDir: string
}

/**
 * A malformed config is named, never reported as absent.
 *
 * `pikku fabric validate` used to swallow the parse error and report
 * `pikku-config-missing` for a file that is right there — the one message
 * guaranteed to send you looking in the wrong place.
 */
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

/**
 * Whether this app authenticates HTTP requests at all.
 *
 * Matches any `betterAuth*Session` definition rather than the literal
 * `betterAuthSession`. The stateless variant is a separate definition id that
 * the CLI wires whenever `session.cookieCache` is enabled, which is the
 * configuration Fabric asks for — so an exact-match check saw no auth on
 * precisely the apps most likely to have it, and silently skipped every auth
 * schema check below.
 */
async function hasAuthSessionMiddleware(fnDir: string): Promise<boolean> {
  const meta = await readJsonSafe<MiddlewareGroupsMeta>(
    join(fnDir, '.pikku', 'middleware', 'pikku-middleware-groups-meta.gen.json')
  )
  if (!meta?.instances) return false
  return Object.values(meta.instances).some((instance) =>
    /^betterAuth\w*Session$/.test(instance.definitionId ?? '')
  )
}

/**
 * Does any statement in `sql` create `tableName`?
 *
 * Every dialect quotes identifiers differently and Kysely's schema builder
 * always quotes, so an unquoted-only match reports a table as missing on the
 * exact projects most likely to have it. Accept each dialect's pair — and only
 * a matching pair, via the backreference, so `"audit'` is not a hit — plus an
 * optional schema qualifier, since `main.audit` is the same table.
 */
export function migrationCreatesTable(sql: string, tableName: string): boolean {
  const escapedTable = tableName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  const qualifier = `(?:(?:["'\`]?\\w+["'\`]?|\\[\\w+\\])\\.)?`
  // The word boundary belongs to the bare alternative only: a trailing `\b`
  // after a closing quote would demand a word character next, so `"audit" (`
  // would not match.
  const quoted = `(?:(["'\`])${escapedTable}\\1|\\[${escapedTable}\\]|${escapedTable}\\b)`
  const re = new RegExp(
    `\\bcreate\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${qualifier}${quoted}`,
    'i'
  )
  return re.test(sql)
}

/** better-auth's core schema — the tables its adapter queries on every request. */
const BETTER_AUTH_TABLES = ['user', 'session', 'account', 'verification']

/**
 * Every table name one better-auth model can be sitting under.
 *
 * `modelName` renames a model's table — `user: { modelName: 'authUser' }` is
 * how an app keeps better-auth's rows out of a `user` table it already owns —
 * and the adapter's CamelCasePlugin then writes that as `auth_user`. An app
 * that renames all four models has none of the default names in its
 * migrations, so a default-names-only check reported it as having no auth
 * schema at all. Accept the default, the override, and the override's
 * snake_case form.
 */
export const betterAuthTableAliases = (
  model: string,
  configText: string
): string[] => {
  const override = configText.match(
    new RegExp(
      `\\b${model}\\s*:\\s*\\{[^{}]*?\\bmodelName\\s*:\\s*['"\`](\\w+)['"\`]`
    )
  )?.[1]
  if (!override) return [model]
  return [
    model,
    override,
    override.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(),
  ]
}

/**
 * Static value imports of a package the deploy bundler stubs.
 *
 * A unit that does not require the service gets the package rewritten to
 * `export {}`, so a static named import fails to bundle — once per unit, with
 * an esbuild message that names the stub rather than the mistake. Type-only
 * imports are erased before bundling and a side-effect import binds nothing,
 * so neither is reported.
 */
export const staticStubbedImports = (
  code: string
): Array<{ module: string; service: string }> => {
  const found: Array<{ module: string; service: string }> = []
  const statements = code.matchAll(
    /^[ \t]*import\s+(?!type\s)([\s\S]*?)\s*from\s*['"`]([^'"`]+)['"`]/gm
  )
  for (const statement of statements) {
    const clause = statement[1]!
    const specifier = statement[2]!
    const named = clause.match(/^\{([\s\S]*)\}$/)
    if (
      named &&
      named[1]!
        .split(',')
        .filter((binding) => binding.trim().length > 0)
        .every((binding) => /^type\s/.test(binding.trim()))
    ) {
      continue
    }
    // Services share pattern arrays — the AI SDKs gate on both `agentRunner`
    // and `ai` — so a per-service push reports one import as many findings.
    // The remedy is the same whichever service names it: one entry per import.
    const service = Object.entries(SERVICE_MODULE_MAP).find(([, patterns]) =>
      patterns.some((pattern) => pattern.test(specifier))
    )?.[0]
    if (service) {
      found.push({ module: specifier, service })
    }
  }
  return found
}

/**
 * The text of every source file that configures better-auth, concatenated.
 *
 * Narrowed to files mentioning `betterAuth` so a `modelName` belonging to some
 * other library cannot rename an auth table out from under the check.
 */
const readAuthConfigText = async (srcDir: string): Promise<string> => {
  if (!existsSync(srcDir)) return ''
  let entries: string[]
  try {
    entries = (await readdir(srcDir, { recursive: true })).filter(
      (f): f is string =>
        typeof f === 'string' &&
        f.endsWith('.ts') &&
        !f.includes('node_modules')
    )
  } catch {
    return ''
  }
  const texts = await Promise.all(
    entries.map((f) => readTextSafe(join(srcDir, f)))
  )
  return texts
    .filter((t): t is string => Boolean(t) && /betterAuth/.test(t!))
    .join('\n')
}

/**
 * Scaffold flags that gate a generated surface the pikku console calls.
 *
 * `console` gates app introspection, so nothing renders without it;
 * `rpc`/`agent`/`workflow` gate endpoints the console hits directly; `events`
 * gates the realtime channel, which no template ships yet — hence the warning.
 */
const REQUIRED_SCAFFOLD: Array<{
  key: 'console' | 'rpc' | 'agent' | 'workflow' | 'events'
  severity: 'error' | 'warn'
  surface: string
}> = [
  {
    key: 'console',
    severity: 'error',
    surface:
      'app introspection (console:getFunctionsMeta and friends) — the console shows no functions',
  },
  { key: 'rpc', severity: 'error', surface: 'the generic /rpc/:name endpoint' },
  {
    key: 'agent',
    severity: 'error',
    surface:
      'the agent endpoints (/rpc/agent/:agentName) — the agent playground 404s',
  },
  {
    key: 'workflow',
    severity: 'error',
    surface:
      'the workflow endpoints (/workflow/:workflowName/start) — triggering a workflow 404s',
  },
  { key: 'events', severity: 'warn', surface: 'the realtime events channel' },
]

/**
 * Every check that is true of any pikku project, regardless of where it deploys.
 *
 * `pikku validate`'s app-project check is exactly this; `pikku fabric validate` is this
 * plus the deploy-shaped checks (themes, frontends, the Cloudflare adapter, the
 * .gitignore contract). Before this module the two were separate walks over the
 * same project that duplicated sixteen findings verbatim, and each carried
 * checks the other lacked for no reason anyone could name.
 *
 * knowledge: decisions/internals/one-project-shape-check-two-validators.md
 */
export async function runSharedProjectChecks(
  root: string
): Promise<SharedCheckResult> {
  const findings: Finding[] = []
  const lines = (...parts: string[]): string => parts.join('\n')

  const e = (id: string, message: string, path: string, fixHint: string) => {
    findings.push({ id, severity: 'error', message, path, fixHint })
  }
  const w = (id: string, message: string, path: string, fixHint: string) => {
    findings.push({ id, severity: 'warn', message, path, fixHint })
  }
  const info = (id: string, message: string, path: string, fixHint: string) => {
    findings.push({ id, severity: 'info', message, path, fixHint })
  }

  // ── pikku.config.json ──────────────────────────────────────────────────
  const pikkuConfigPath = join(root, 'pikku.config.json')
  const pikkuConfig = await readJsonSafe<SharedPikkuConfig>(pikkuConfigPath)
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
    for (const s of REQUIRED_SCAFFOLD) {
      if (pikkuConfig.scaffold?.[s.key]) continue
      const report = s.severity === 'error' ? e : w
      report(
        `pikku-config-no-scaffold-${s.key}`,
        `pikku.config.json scaffold is missing "${s.key}" — ${s.surface} is never generated, so the console 404s for it`,
        pikkuConfigPath,
        lines(
          `Add "${s.key}" to the scaffold block in pikku.config.json:`,
          '"scaffold": {',
          '  "pikkuDir": "packages/functions/src/scaffold",',
          `  "${s.key}": true`,
          '}',
          'Then re-run codegen (`pikku all`) and restart the dev server.'
        )
      )
    }
  }
  const dbEngine = pikkuConfig?.db?.engine ?? 'sqlite'

  // ── root package.json ──────────────────────────────────────────────────
  type RootPkg = {
    workspaces?: unknown
    scripts?: Record<string, string>
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

    const allDeps = { ...rootPkg.dependencies, ...rootPkg.devDependencies }
    if (!allDeps['@pikku/core']) {
      e(
        'missing-core',
        '@pikku/core not in dependencies',
        rootPkgPath,
        'Add "@pikku/core" to dependencies'
      )
    }

    // Vendor tgz presence — only file: deps that reference a vendor/ path.
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
          `Run \`pikku pack\` in the pikku source repo and copy the output to ${relPath}`
        )
      }
    }
  }

  // ── packages/functions/ ────────────────────────────────────────────────
  const fnDir = join(root, 'packages', 'functions')
  const fnPkgPath = join(fnDir, 'package.json')
  let fnPkg: SharedFnPkg | null = null

  // Migrations live at the repo root, which is where `pikku db migrate` reads
  // them from (see local-db.ts). Workspace validate used to look inside
  // packages/functions/db, so every auth schema check it made ran against a
  // directory that does not exist in any project the CLI can migrate.
  const migrationsDir = join(root, 'db', dbEngine)

  if (!existsSync(fnDir)) {
    e(
      'functions-pkg-missing',
      'packages/functions/ directory not found',
      fnDir,
      'Create packages/functions/ as a workspace containing src/, tests/, config.ts, and any local db assets you use'
    )
  } else {
    fnPkg = await readJsonSafe<SharedFnPkg>(fnPkgPath)
    if (!fnPkg) {
      e(
        'functions-package-json-missing',
        'packages/functions/package.json not found',
        fnPkgPath,
        'Create packages/functions/package.json and declare the workspace package'
      )
    } else {
      if (fnPkg.type !== 'module') {
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

      // @pikku/playwright earns its keep by declaration merging: it is what
      // puts `page`, `context` and `locate` on a step's `PikkuBrowserWire`. A
      // merge only applies if the compiler loads the module, and a tsconfig
      // with an explicit `types` array loads nothing it is not told to. A step
      // that reaches for `wire.page` without importing the package anywhere in
      // the program then fails to type-check with a message about a property
      // that does not exist — which reads like the step is wrong, not the
      // tsconfig. Listing the package in `types` loads it either way.
      if (fnDeps['@pikku/playwright']) {
        const tsconfigPath = join(fnDir, 'tsconfig.json')
        const tsconfig = await readJsonSafe<{
          compilerOptions?: { types?: string[] }
        }>(tsconfigPath)
        const types = tsconfig?.compilerOptions?.types
        if (types && !types.includes('@pikku/playwright')) {
          w(
            'playwright-types-not-loaded',
            'packages/functions depends on @pikku/playwright but does not list it in "compilerOptions.types" — the browser bindings it adds to a step (page, context, locate) will not be typed',
            tsconfigPath,
            lines(
              'Add it to the types array in packages/functions/tsconfig.json:',
              `  "types": ${JSON.stringify([...types, '@pikku/playwright'])}`,
              'The package declaration-merges PikkuBrowserWire, and an explicit',
              '`types` array means the compiler only loads what it is told to.'
            )
          )
        }
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
    } else {
      for (const { module, service } of staticStubbedImports(servicesText)) {
        e(
          'services-static-stubbed-import',
          `services.ts imports '${module}' statically, but the deploy bundler stubs it in every unit that does not require '${service}'`,
          servicesPath,
          lines(
            `Every unit without '${service}' gets '${module}' rewritten to \`export {}\`, so a static import fails to bundle there.`,
            'Import the type only, then load the package when you build the service:',
            `  const mod = await import('${module}')`,
            '  if (mod.SomeExport) { ... }',
            'See templates/starter-template/packages/functions/src/services.ts for the shape.'
          )
        )
      }
    }

    // ── auth schema ──────────────────────────────────────────────────────
    // The tables are better-auth's own (`user`, `session`, `account`,
    // `verification`) because those are what the adapter queries. This check
    // used to look for `app_user` and `auth_verification_token`, two names that
    // appear nowhere else in pikku or in any template — it never fired against a
    // real app, and would have been wrong for every one of them if it had.
    const authEnabled = await hasAuthSessionMiddleware(fnDir)
    const configText = await readTextSafe(join(fnDir, 'src', 'config.ts'))
    const missingAuthTables: string[] = []
    if (existsSync(migrationsDir)) {
      try {
        const files = (await readdir(migrationsDir))
          .filter((f) => f.endsWith('.sql'))
          .sort()
        const nums: number[] = []
        for (const f of files) {
          const m = f.match(/^(\d+)/)
          if (m) nums.push(parseInt(m[1]!, 10))
        }
        for (let idx = 1; idx < nums.length; idx++) {
          if (nums[idx] !== nums[idx - 1]! + 1) {
            const missing = `${nums[idx - 1]! + 1}..${nums[idx]! - 1}`
            e(
              'migration-gap',
              `Migration numbering gap: IDs ${missing} are missing`,
              migrationsDir,
              'Migrations must be consecutive. Add the missing .sql file or renumber if not yet applied.'
            )
            break
          }
        }
        if (authEnabled) {
          const allSql = (
            await Promise.all(
              files.map((f) => readTextSafe(join(migrationsDir, f)))
            )
          )
            .filter((sql): sql is string => Boolean(sql))
            .join('\n')
          const authConfigText = await readAuthConfigText(join(fnDir, 'src'))
          for (const table of BETTER_AUTH_TABLES) {
            const aliases = betterAuthTableAliases(table, authConfigText)
            if (!aliases.some((name) => migrationCreatesTable(allSql, name))) {
              missingAuthTables.push(table)
            }
          }
        }
      } catch {
        // readdir failure — skip
      }
    } else if (authEnabled) {
      missingAuthTables.push(...BETTER_AUTH_TABLES)
    }

    // `pikku db migrate` falls back to .pikku-runtime/dev.db whenever db/sqlite
    // exists (see db-shared.ts), so sqliteDb in createConfig is only required
    // when the project has no conventional db assets at all. Demanding it
    // unconditionally failed every project using the layout the CLI expects.
    const hasConventionalDbAssets =
      existsSync(join(root, 'db', 'sqlite')) ||
      existsSync(join(root, 'db', 'postgres'))
    if (
      authEnabled &&
      dbEngine !== 'postgres' &&
      !/sqliteDb/.test(configText ?? '') &&
      !hasConventionalDbAssets
    ) {
      e(
        'auth-dev-db-missing',
        'Auth middleware is registered, but there is no db/sqlite directory and createConfig does not set sqliteDb — `pikku db migrate` has no database to create',
        join(fnDir, 'src', 'config.ts'),
        'Add db/sqlite/ with numbered migrations, or set sqliteDb in createConfig'
      )
    }

    if (missingAuthTables.length > 0) {
      e(
        'auth-schema-missing-tables',
        `Auth middleware is registered, but no SQL migration creates: ${missingAuthTables.join(', ')} — better-auth queries these tables on every request`,
        migrationsDir,
        lines(
          `Add a migration under db/${dbEngine}/ that creates the better-auth core schema:`,
          '  user, session, account, verification',
          'The pikku-auth skill generates one for the dialect you are on.'
        )
      )
    }

    // ── generated types must stay generated ──────────────────────────────
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

    // ── layout ───────────────────────────────────────────────────────────
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

  const sdkDir = join(root, 'packages', 'functions-sdk')
  if (!existsSync(sdkDir)) {
    info(
      'functions-sdk-missing',
      'packages/functions-sdk/ not found — generated RPC client and React Query hooks will not be available',
      sdkDir,
      'Create packages/functions-sdk/ as a workspace with src/pikku/ as the generated output root; point clientFiles.rpcMapDeclarationFile and clientFiles.reactQueryFile there'
    )
  }

  // ── server bootstrap ───────────────────────────────────────────────────
  findings.push(...(await runBootstrapChecks(root, rootPkg, pikkuConfig)))

  findings.push(
    ...runWebsocketDepsChecks({
      root,
      runtime:
        typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
          ? 'bun'
          : 'node',
      hasChannels: await projectWiresChannels(
        root,
        typeof pikkuConfig?.outDir === 'string' ? pikkuConfig.outDir : '.pikku'
      ),
      resolve: (specifier) => resolveFromProject(root, specifier),
    })
  )

  // ── personas, scenario files and the knowledge base ────────────────────
  findings.push(...(await runPersonaChecks(root, pikkuConfig)))
  findings.push(...(await runAuthPluginChecks(root, pikkuConfig)))

  const srcDirectories = Array.isArray(pikkuConfig?.srcDirectories)
    ? pikkuConfig.srcDirectories.filter(
        (d): d is string => typeof d === 'string'
      )
    : []
  findings.push(...(await runScenarioFileChecks(root, srcDirectories)))

  const knowledge = await runKnowledgeValidate(
    root,
    join(
      root,
      typeof pikkuConfig?.outDir === 'string' ? pikkuConfig.outDir : '.pikku'
    )
  )
  for (const finding of knowledge.findings) {
    findings.push({ ...finding, path: join(root, finding.path) })
  }

  return { findings, pikkuConfig, fnPkg, fnDir, dbEngine, migrationsDir }
}
