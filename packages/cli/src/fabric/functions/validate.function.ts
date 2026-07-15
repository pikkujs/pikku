import { z } from 'zod'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
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

// List .ts/.tsx source files under a directory (skips node_modules). Used to
// scan an app for raw @mantine/core imports and i18n usage.
async function listSourceFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return []
  try {
    return (await readdir(dir, { recursive: true }))
      .filter(
        (f): f is string =>
          typeof f === 'string' &&
          (f.endsWith('.ts') || f.endsWith('.tsx')) &&
          !f.includes('node_modules')
      )
      .map((f) => join(dir, f))
  } catch {
    return []
  }
}

// Heavy/generated dirs pruned during a source walk.
const SKIP_WALK_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.pikku',
  '.pikku-runtime',
  '.vite',
  '.tanstack',
  '.turbo',
  '.reports',
])

// Recursively list handwritten .ts/.tsx files under a dir, pruning heavy dirs
// (node_modules, build output, generated) DURING traversal and skipping .gen.*
// files. Unlike listSourceFiles (which scans only src/ to dodge node_modules),
// this walks a whole workspace root — Next-style app layouts keep code outside
// src/ (pikku/, components/, views/, framework/).
async function walkSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()!
    let entries
    try {
      entries = await readdir(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (!SKIP_WALK_DIRS.has(ent.name)) stack.push(join(cur, ent.name))
      } else if (
        (ent.name.endsWith('.ts') || ent.name.endsWith('.tsx')) &&
        !ent.name.endsWith('.gen.ts') &&
        !ent.name.endsWith('.gen.tsx')
      ) {
        out.push(join(cur, ent.name))
      }
    }
  }
  return out
}

// Module-singleton-sensitive packages: a SECOND physical copy splits
// module-level state. The TanStack Start dev server registers its SSR
// middleware on one copy of @tanstack/start-plugin-core while the config hook
// reads another, so the frontend serves "Cannot GET /" (404). React/react-dom
// duplicates break hooks. This is a workspace-hoisting artifact, not a version
// mismatch — `resolutions` pins do NOT collapse it. Curated, not exhaustive:
// most duplicate deps are harmless, so only these are checked.
const SINGLETON_SENSITIVE_PKGS = [
  'vite',
  '@tanstack/start-plugin-core',
  'react',
  'react-dom',
]

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
    // Each scaffold key gates generation of a public surface the Fabric console
    // calls. Missing one means those endpoints are never generated, so the
    // console 404s even though the functions/agents/workflows are wired. The
    // generated file paths auto-derive from the flag (see pikku-cli-config), so
    // setting the flag is sufficient. console/rpc/agent/workflow gate HTTP/RPC
    // endpoints the console hits directly → error; events gates the realtime
    // channel (feature-dependent, no template ships it yet) → warn.
    const REQUIRED_SCAFFOLD: Array<{
      key: 'console' | 'rpc' | 'agent' | 'workflow' | 'events'
      severity: 'error' | 'warn'
      surface: string
      value: string
    }> = [
      {
        key: 'console',
        severity: 'error',
        surface:
          'app introspection (console:getFunctionsMeta and friends) — the sandbox builder shows no functions',
        value: '"auth"',
      },
      {
        key: 'rpc',
        severity: 'error',
        surface: 'the generic /rpc/:name endpoint',
        value: 'true',
      },
      {
        key: 'agent',
        severity: 'error',
        surface:
          'the agent endpoints (/rpc/agent/:agentName) — the agent playground 404s',
        value: '"no-auth"',
      },
      {
        key: 'workflow',
        severity: 'error',
        surface:
          'the workflow endpoints (/workflow/:workflowName/start) — triggering a workflow 404s',
        value: '"no-auth"',
      },
      {
        key: 'events',
        severity: 'warn',
        surface: 'the realtime events channel',
        value: 'true',
      },
    ]
    for (const s of REQUIRED_SCAFFOLD) {
      if (pikkuConfig.scaffold?.[s.key]) continue
      const report = s.severity === 'error' ? e : w
      report(
        `pikku-config-no-scaffold-${s.key}`,
        `pikku.config.json scaffold is missing "${s.key}" — ${s.surface} is never generated, so the Fabric console 404s for it`,
        pikkuConfigPath,
        lines(
          `Add "${s.key}" to the scaffold block in pikku.config.json:`,
          '"scaffold": {',
          '  "pikkuDir": "packages/functions/src/scaffold",',
          `  "${s.key}": ${s.value}`,
          '}',
          'Then re-run codegen (`pikku all`) and restart the dev server.'
        )
      )
    }
  }
  const dbEngine = pikkuConfig?.db?.engine ?? 'sqlite'

  // ── .gitignore must ignore generated/runtime artifacts ─────────────────
  // These are regenerated on every dev boot / scaffold / codegen. Committing
  // them lets a stale copy shadow the freshly generated one — a committed
  // __fabric_scaffold.vite.config.mjs or .pikku-runtime breaks the sandbox dev
  // server — and pollutes diffs. Tolerate trailing/leading slashes.
  {
    const requiredIgnores = [
      '.opencode',
      '.pikku',
      '.pikku-runtime',
      '.reports',
      '__fabric_scaffold.vite.config.mjs',
    ]
    const gitignorePath = join(root, '.gitignore')
    const gitignoreText = await readTextSafe(gitignorePath)
    const norm = (s: string): string => s.replace(/^\//, '').replace(/\/$/, '')
    const ignored = new Set(
      (gitignoreText ?? '')
        .split('\n')
        .map((l) => norm(l.trim()))
        .filter(Boolean)
    )
    const missing = requiredIgnores.filter((entry) => !ignored.has(norm(entry)))
    // Generated files: accept a single `*.gen.*` glob or the explicit
    // `*.gen.ts` + `*.gen.js` pair (the canonical scaffold uses the pair).
    const genIgnored =
      ignored.has('*.gen.*') ||
      (ignored.has('*.gen.ts') && ignored.has('*.gen.js'))
    if (!genIgnored) missing.push('*.gen.*')
    if (missing.length > 0) {
      w(
        'gitignore-missing-generated',
        `.gitignore does not ignore Fabric generated/runtime artifacts: ${missing.join(', ')} — committing them lets a stale copy shadow the freshly generated one (e.g. a committed __fabric_scaffold.vite.config.mjs or .pikku-runtime breaks the sandbox dev server)`,
        gitignorePath,
        lines(
          'Add these entries to .gitignore:',
          ...missing.map((entry) => `  ${entry}`),
          'They are regenerated on every dev boot / scaffold / codegen and must never be committed.'
        )
      )
    }
  }

  // ── required project files ────────────────────────────────────────────
  // These files must exist and be committed — they are seeded from the sandbox
  // but belong to the project so the AI agent can read and update them.
  for (const relPath of [
    'db/annotations.ts',
    'knowledge/design-language.md',
    'knowledge/security.md',
    'knowledge/technology.md',
  ]) {
    if (!existsSync(join(root, relPath))) {
      w(
        `missing-required-file-${relPath.replace(/[^a-z0-9]/gi, '-')}`,
        `${relPath} is missing — this file must be committed to the project`,
        join(root, relPath),
        lines(
          `Create ${relPath} and commit it.`,
          'The starter-template ships a stub you can copy as a starting point.'
        )
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

  // ── scaffold-implied dependencies ──────────────────────────────────────
  // `scaffold.console` makes codegen import
  // `@pikku/addon-console/.pikku/pikku-bootstrap.gen.js` from the generated
  // bootstrap — an import that lives only in *.gen.ts, so the undeclared-deps
  // src/ scan below never sees it. Without the package installed, `pikku dev`
  // crash-loops ("Cannot find module '@pikku/addon-console/...'") and a
  // sandbox never leaves the "migrating" boot phase.
  if (pikkuConfig?.scaffold?.console) {
    // The functions package = nearest package.json above the first srcDirectory.
    const srcDirs = Array.isArray(pikkuConfig.srcDirectories)
      ? (pikkuConfig.srcDirectories as string[])
      : []
    let fnPkgPath: string | null = null
    if (srcDirs[0]) {
      let dir = join(root, srcDirs[0])
      while (dir !== root && dir !== dirname(dir)) {
        dir = dirname(dir)
        if (existsSync(join(dir, 'package.json'))) {
          fnPkgPath = join(dir, 'package.json')
          break
        }
      }
    }
    const fnPkg = fnPkgPath
      ? await readJsonSafe<{
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
        }>(fnPkgPath)
      : null
    const declared =
      fnPkg?.dependencies?.['@pikku/addon-console'] ||
      fnPkg?.devDependencies?.['@pikku/addon-console']
    if (fnPkgPath && !declared) {
      e(
        'missing-addon-console',
        'pikku.config.json scaffold enables "console" but the functions package does not declare @pikku/addon-console — the generated bootstrap imports it, so `pikku dev` crash-loops with "Cannot find module \'@pikku/addon-console/.pikku/pikku-bootstrap.gen.js\'"',
        fnPkgPath,
        lines(
          `Add it to ${fnPkgPath} dependencies (the functions package, not the root):`,
          '  "@pikku/addon-console": "^0.12.21"',
          'then reinstall.'
        )
      )
    }
  }

  // ── undeclared dependencies ────────────────────────────────────────────
  // Every external module imported from a package's src/ must be declared in
  // that package's own dependencies/devDependencies/peerDependencies. An
  // undeclared import still type-checks locally (tsconfig `paths` or root
  // workspace hoisting resolve it), but the deploy bundle (esbuild / Bun.build)
  // resolves per-package and fails with "Could not resolve <pkg>. Maybe you
  // need to bun install?" — aborting the deploy. Catch that class here.
  {
    const NODE_BUILTINS = new Set([
      'assert',
      'async_hooks',
      'buffer',
      'child_process',
      'cluster',
      'console',
      'constants',
      'crypto',
      'dgram',
      'dns',
      'domain',
      'events',
      'fs',
      'http',
      'http2',
      'https',
      'inspector',
      'module',
      'net',
      'os',
      'path',
      'perf_hooks',
      'process',
      'punycode',
      'querystring',
      'readline',
      'repl',
      'stream',
      'string_decoder',
      'timers',
      'tls',
      'tty',
      'url',
      'util',
      'v8',
      'vm',
      'worker_threads',
      'zlib',
    ])
    const pkgNameOf = (spec: string): string =>
      spec.startsWith('@')
        ? spec.split('/').slice(0, 2).join('/')
        : spec.split('/')[0]

    const wsDirs: string[] = []
    for (const group of ['packages', 'apps', 'backends']) {
      const groupDir = join(root, group)
      if (!existsSync(groupDir)) continue
      try {
        for (const d of await readdir(groupDir, { withFileTypes: true })) {
          if (
            d.isDirectory() &&
            existsSync(join(groupDir, d.name, 'package.json'))
          ) {
            wsDirs.push(join(groupDir, d.name))
          }
        }
      } catch {
        // ignore
      }
    }

    // Workspace package names resolve via the monorepo, not npm — never "missing".
    const wsNames = new Set<string>()
    for (const dir of wsDirs) {
      const p = await readJsonSafe<{ name?: string }>(join(dir, 'package.json'))
      if (p?.name) wsNames.add(p.name)
    }

    for (const dir of wsDirs) {
      const pkg = await readJsonSafe<{
        name?: string
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
        optionalDependencies?: Record<string, string>
      }>(join(dir, 'package.json'))
      if (!pkg) continue
      const declared = new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
        ...Object.keys(pkg.optionalDependencies ?? {}),
      ])
      // tsconfig `paths` keys (e.g. "@/*") are internal aliases, not packages.
      const tsconfig = await readJsonSafe<{
        compilerOptions?: { paths?: Record<string, unknown> }
      }>(join(dir, 'tsconfig.json'))
      const aliasPrefixes = Object.keys(
        tsconfig?.compilerOptions?.paths ?? {}
      ).map((k) => k.replace(/\*$/, ''))

      const used = new Map<string, string>()
      for (const file of await listSourceFiles(join(dir, 'src'))) {
        if (/\.gen\.(ts|tsx)$/.test(file)) continue
        const txt = await readTextSafe(file)
        if (!txt) continue
        const re = /(?:from|import|require)\s*\(?\s*['"]([^'".#][^'"]*)['"]/g
        let m: RegExpExecArray | null
        while ((m = re.exec(txt))) {
          const spec = m[1]
          if (
            spec.startsWith('node:') ||
            spec.startsWith('@/') ||
            spec.startsWith('~') ||
            spec.startsWith('virtual:') ||
            spec.includes('${')
          ) {
            continue
          }
          if (
            aliasPrefixes.some(
              (a) => spec === a.replace(/\/$/, '') || spec.startsWith(a)
            )
          ) {
            continue
          }
          const name = pkgNameOf(spec)
          if (NODE_BUILTINS.has(name) || name === pkg.name || wsNames.has(name))
            continue
          if (!used.has(name)) used.set(name, file)
        }
      }
      const missing = [...used.keys()].filter((n) => !declared.has(n)).sort()
      if (missing.length) {
        e(
          `undeclared-deps-${(pkg.name ?? dir).replace(/[@/]/g, '-')}`,
          `${pkg.name ?? dir} imports undeclared package(s): ${missing.join(', ')} — the deploy bundle cannot resolve them`,
          join(dir, 'package.json'),
          lines(
            `Add the missing package(s) to ${pkg.name ?? 'this package'}'s dependencies, e.g.:`,
            ...missing.map((n) => `  "${n}": "<version>"`),
            'then reinstall. They import-resolve locally via tsconfig paths / root',
            'hoisting, but esbuild/Bun.build resolves each package independently.'
          )
        )
      }

      // @pikku/browser pins `puppeteer-core` to the exact version that
      // @cloudflare/puppeteer forks, so headless rendering behaves identically
      // locally and on Cloudflare Browser Rendering. A project using it must pin
      // that same version, or its local/sandbox output diverges from deploy.
      // (puppeteer-core, not puppeteer, so nothing ever downloads a Chromium.)
      const usesBrowser =
        !!pkg.dependencies?.['@pikku/browser'] ||
        !!pkg.devDependencies?.['@pikku/browser']
      if (usesBrowser) {
        const browserPkg = await readJsonSafe<{
          peerDependencies?: Record<string, string>
        }>(join(root, 'node_modules', '@pikku', 'browser', 'package.json'))
        const required = browserPkg?.peerDependencies?.['puppeteer-core']
        const projectPin =
          pkg.dependencies?.['puppeteer-core'] ??
          pkg.devDependencies?.['puppeteer-core']
        const slug = (pkg.name ?? dir).replace(/[@/]/g, '-')
        if (required && !projectPin) {
          w(
            `browser-puppeteer-missing-${slug}`,
            `${pkg.name ?? dir} depends on @pikku/browser but declares no puppeteer-core — LocalBrowserService will throw at runtime (local/sandbox/server rendering)`,
            join(dir, 'package.json'),
            `Add "puppeteer-core": "${required}" to run headless rendering off Cloudflare.`
          )
        } else if (required && projectPin && projectPin !== required) {
          e(
            `browser-puppeteer-version-${slug}`,
            `${pkg.name ?? dir} pins puppeteer-core "${projectPin}" but @pikku/browser requires "${required}" — local rendering would diverge from Cloudflare Browser Rendering, which forks that exact version`,
            join(dir, 'package.json'),
            lines(
              `Set "puppeteer-core": "${required}" so headless rendering behaves`,
              'identically locally and on deploy. Bump it in lockstep with',
              '@pikku/browser (which tracks @cloudflare/puppeteer) when it changes.'
            )
          )
        }
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
      if (!fnPkg.imports?.['#pikku/*']) {
        e(
          'functions-pkg-missing-pikku-wildcard-import',
          'packages/functions/package.json is missing "#pikku/*" in "imports" — wiring files that import e.g. "#pikku/pikku-types.gen.js" fail at runtime with "Cannot find module"',
          fnPkgPath,
          'Add to "imports": { "#pikku": "./.pikku/pikku-types.gen.ts", "#pikku/*": "./.pikku/*" }'
        )
      }

      // .pikku/pikku-types.gen.js wrapper — the sandbox runs `pikku dev` via
      // bare Node.js (no tsx), which cannot load .ts files. Every .gen.ts in
      // .pikku/ needs a matching .gen.js wrapper. The sandbox entrypoint creates
      // these during provisioning but NOT on subsequent restarts after agent
      // edits — so after any restart pikku dev crashes with
      // "Cannot find module '#pikku/pikku-types.gen.js'". Run `pikku fabric smoke`
      // to test locally; the smoke command recreates the wrappers automatically.
      {
        const pikkuGenDir = join(fnDir, '.pikku')
        const typesGenTs = join(pikkuGenDir, 'pikku-types.gen.ts')
        const typesGenJs = join(pikkuGenDir, 'pikku-types.gen.js')
        if (existsSync(typesGenTs) && !existsSync(typesGenJs)) {
          e(
            'pikku-types-js-wrapper-missing',
            'packages/functions/.pikku/pikku-types.gen.js is missing — the sandbox runs pikku dev via bare Node.js, which cannot load .ts files; without the .js wrapper it crashes with "Cannot find module \'#pikku/pikku-types.gen.js\'" on every restart',
            typesGenTs,
            lines(
              'Create packages/functions/.pikku/pikku-types.gen.js:',
              "  import './pikku-types.gen.ts';",
              "  export * from './pikku-types.gen.ts';",
              'Or run `pikku fabric smoke` to test the full boot locally (it creates the wrappers).',
              'This file is gitignored — it must be recreated after every `pikku all` run.'
            )
          )
        }
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

      // CF worker runtime deps — must be in dependencies (not dev), every
      // worker entry resolves them at deploy time.
      if (!fnPkg.dependencies?.['@pikku/schema-cfworker']) {
        e(
          'missing-schema-cfworker',
          '@pikku/schema-cfworker is not in packages/functions dependencies — every Cloudflare worker entry requires it',
          fnPkgPath,
          'Run `yarn add @pikku/schema-cfworker` in packages/functions — must be in dependencies, not devDependencies'
        )
      }
      if (!fnPkg.dependencies?.['@pikku/kysely']) {
        e(
          'missing-pikku-kysely',
          '@pikku/kysely is not in packages/functions dependencies — every Cloudflare worker entry requires it (KyselySecretService)',
          fnPkgPath,
          'Run `yarn add @pikku/kysely` in packages/functions — must be in dependencies, not devDependencies'
        )
      }
    }

    // Agent units require the AI SDK deps explicitly (not CI-injected). Gate on
    // the generated agent meta so non-agent projects aren't flagged.
    const agentMeta = await readJsonSafe<{
      agentsMeta?: Record<string, unknown>
    }>(join(fnDir, '.pikku', 'agent', 'pikku-agent-wirings-meta.gen.json'))
    if (agentMeta && Object.keys(agentMeta.agentsMeta ?? {}).length > 0) {
      const fnPkgPath = join(fnDir, 'package.json')
      if (!fnPkg?.dependencies?.['@pikku/ai-vercel']) {
        e(
          'missing-ai-vercel',
          'Project declares agent units but @pikku/ai-vercel is not in packages/functions dependencies',
          fnPkgPath,
          'Run `yarn add @pikku/ai-vercel` in packages/functions — must be in dependencies, not devDependencies'
        )
      }
      if (!fnPkg?.dependencies?.['@ai-sdk/openai-compatible']) {
        e(
          'missing-ai-sdk-openai-compatible',
          'Project declares agent units but @ai-sdk/openai-compatible is not in packages/functions dependencies',
          fnPkgPath,
          'Run `yarn add @ai-sdk/openai-compatible` in packages/functions — must be in dependencies, not devDependencies'
        )
      }
      // `ai` is a peer dep of @pikku/ai-vercel — not auto-installed. Without it
      // `pikku dev` can't construct the agent runner and agents 503 with
      // AIProviderNotConfiguredError.
      if (!fnPkg?.dependencies?.['ai']) {
        e(
          'missing-ai-sdk-core',
          'Project declares agent units but `ai` (the Vercel AI SDK) is not in packages/functions dependencies — it is a peer dependency of @pikku/ai-vercel and is not installed automatically',
          fnPkgPath,
          'Run `yarn add ai` in packages/functions — must be in dependencies, not devDependencies'
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
        const appFiles = (await readdir(appsDir, { recursive: true })).filter(
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
          if (
            baseURL &&
            /['"`]\/api['"`]/.test(baseURL) &&
            !/auth/i.test(baseURL)
          ) {
            w(
              'better-auth-client-baseurl-missing-auth',
              `createAuthClient baseURL is ${baseURL.trim()} — it omits the /auth segment, so the client calls /api/sign-in/email instead of /api/auth/sign-in/email and auth 404s`,
              join(appsDir, rel),
              'Append the auth basePath: baseURL: `${apiUrl()}/auth` (resolving to /api/auth)'
            )
          }
        }
      } catch {
        // readdir failure — skip
      }
    }

    // ── better-auth stateless session (unit tree-shaking) ──────────────────
    // Without `session.cookieCache`, the CLI wires the STATEFUL betterAuthSession
    // bridge globally — every non-auth unit then bundles the full better-auth
    // server (~2.5MB each), bloating bundles and the serial deploy uploads.
    // Enabling cookieCache splits out a lean betterAuthStatelessSession that
    // verifies the signed cookie, so only the auth unit carries the server. A
    // hand-written global betterAuthSession defeats it the same way.
    const fnSrcDir = join(fnDir, 'src')
    if (existsSync(fnSrcDir)) {
      try {
        const srcFiles = (
          (await readdir(fnSrcDir, { recursive: true })) as string[]
        ).filter(
          (f) =>
            typeof f === 'string' &&
            (f.endsWith('.ts') || f.endsWith('.tsx')) &&
            !f.endsWith('.gen.ts') &&
            !f.includes('node_modules')
        )
        for (const rel of srcFiles) {
          const full = join(fnSrcDir, rel)
          const text = await readTextSafe(full)
          if (!text) continue
          // 1) better-auth config without cookieCache enabled.
          if (
            /\bpikkuBetterAuth\s*\(/.test(text) &&
            /\bbetterAuth\s*\(/.test(text)
          ) {
            const cookieCacheDisabled =
              !/cookieCache/.test(text) ||
              /cookieCache\s*:\s*\{[^}]*enabled\s*:\s*false/.test(text)
            if (cookieCacheDisabled) {
              w(
                'better-auth-stateless-session-disabled',
                'better-auth config does not enable session.cookieCache — every non-auth unit bundles the full better-auth server (~2.5MB each), bloating bundles and the serial deploy uploads',
                full,
                'Add `session: { cookieCache: { enabled: true } }` to the betterAuth({...}) config so the CLI splits out betterAuthStatelessSession (pikku #737)'
              )
            }
          }
          // 2) hand-written global stateful betterAuthSession bridge.
          if (
            /addHTTPMiddleware\s*\(\s*['"`]\*['"`]/.test(text) &&
            /\bbetterAuthSession\s*\(/.test(text) &&
            !/betterAuthStatelessSession/.test(text)
          ) {
            w(
              'better-auth-stateful-session-global',
              'a global addHTTPMiddleware registers the stateful betterAuthSession bridge — it pulls the full better-auth server into every unit, defeating stateless tree-shaking',
              full,
              'Switch to betterAuthStatelessSession (requires session.cookieCache). A custom mapSession is currently pre-empted by the CLI-generated stateless middleware — see pikku #754'
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
          "Replace the file with a single line: export type { DB } from '../../.pikku/db/schema.gen.js' then run `yarn db:types` to regenerate"
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

      // ── i18n + @pikku/mantine convergence (React frontend apps) ──────────
      // Every frontend converges onto the canonical starter-template stack:
      // Paraglide JS (inlang) for translation + components imported from
      // @pikku/mantine/core (whose I18nNode-typed props make untranslated
      // strings a compile error). A raw @mantine/core import bypasses that gate.
      // The i18next → Paraglide cutover is hard (no back-compat), so a residual
      // i18next dep or useTranslation()/useI18n() call is an error.
      const appAllDeps = {
        ...appPkg.dependencies,
        ...appPkg.devDependencies,
      }
      const isReactFrontend = !!(
        appAllDeps['@mantine/core'] ||
        appAllDeps['@pikku/mantine'] ||
        appAllDeps['react']
      )
      if (isReactFrontend) {
        const srcFiles = await listSourceFiles(join(appPath, 'src'))
        let usesMessages = false
        const rawMantineFiles: string[] = []
        const legacyI18nFiles: string[] = []
        for (const file of srcFiles) {
          const text = await readTextSafe(file)
          if (!text) continue
          const rel = file.slice(appPath.length + 1)
          const norm = rel.replace(/\\/g, '/')
          // Paraglide usage: the reactive useLocale() hook or an import from the
          // local `@/i18n` scaffold (messages `m`, mKey/mList) — either means
          // strings flow through compiled messages.
          if (
            /\buseLocale\s*\(/.test(text) ||
            /from\s+['"]@\/i18n(?:\/[\w-]+)?['"]/.test(text)
          ) {
            usesMessages = true
          }
          // Legacy i18next/react-i18next/@pikku/react-i18n markers — removed by
          // the cutover. The scaffold's own config.ts names these in comments,
          // so skip src/i18n/ and match imports/hook calls, not bare words.
          if (
            !/(?:^|\/)i18n\//.test(norm) &&
            (/from\s+['"](?:react-i18next|i18next|@pikku\/react\/i18n)['"]/.test(
              text
            ) ||
              /\buseTranslation\s*\(/.test(text) ||
              /\buseI18n\s*\(/.test(text))
          ) {
            legacyI18nFiles.push(rel)
          }
          // component import from @mantine/core — the trailing quote excludes
          // the `@mantine/core/styles.css` side-effect import and @mantine/hooks
          if (/from\s+['"]@mantine\/core['"]/.test(text)) {
            rawMantineFiles.push(rel)
          }
        }

        const hasParaglideDep = !!appAllDeps['@inlang/paraglide-js']
        const hasMessagesDir = existsSync(join(appPath, 'messages'))
        const hasInlangProject = existsSync(
          join(appPath, 'project.inlang', 'settings.json')
        )
        const hasLegacyI18nDeps = !!(
          appAllDeps['i18next'] || appAllDeps['react-i18next']
        )

        // 1) i18next must be fully removed — hard cutover to Paraglide.
        if (hasLegacyI18nDeps) {
          e(
            `app-legacy-i18next-dep-${name}`,
            `apps/${name} still depends on i18next/react-i18next — Fabric migrated to Paraglide JS (inlang); the i18next stack must be removed`,
            join(appPath, 'package.json'),
            lines(
              'Remove "i18next", "react-i18next" and "i18next-browser-languagedetector".',
              'Add "@inlang/paraglide-js" (devDependencies) and the src/i18n scaffold.',
              'Reference: templates/starter-template/apps/app.'
            )
          )
        }
        if (legacyI18nFiles.length > 0) {
          e(
            `app-legacy-i18n-usage-${name}`,
            `apps/${name} still calls useTranslation()/useI18n() or imports i18next in ${legacyI18nFiles.length} file(s) — these are removed by the Paraglide cutover`,
            join(appPath, 'src'),
            lines(
              'Convert legacy i18n usage to Paraglide in:',
              ...legacyI18nFiles.slice(0, 10).map((f) => `  - ${f}`),
              ...(legacyI18nFiles.length > 10
                ? [`  …and ${legacyI18nFiles.length - 10} more`]
                : []),
              "Replace `const { t } = useTranslation()` with `useLocale()` from '@/i18n/config',",
              "and `t('a.b')` with `m.a_b()` from '@/i18n/messages'."
            )
          )
        }

        // 2) Paraglide must be present and wired (messages + inlang project).
        if (!hasParaglideDep) {
          e(
            `app-missing-paraglide-${name}`,
            `apps/${name} has no Paraglide i18n stack — every Fabric frontend must be translatable`,
            join(appPath, 'package.json'),
            lines(
              'Add the canonical Paraglide stack:',
              '1. devDep: "@inlang/paraglide-js".',
              '2. messages/<locale>.json + project.inlang/settings.json (snake_case keys).',
              '3. src/i18n scaffold: config.ts (useLocale), messages.ts (branded `m`), ident.ts.',
              '4. vite.config: paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide" }).',
              'Route every user-visible string through `m.*()`; reference templates/starter-template/apps/app/src/i18n.'
            )
          )
        } else if (!hasMessagesDir || !hasInlangProject) {
          e(
            `app-paraglide-not-wired-${name}`,
            `apps/${name} declares @inlang/paraglide-js but is missing ${!hasMessagesDir ? 'messages/' : 'project.inlang/settings.json'} — Paraglide cannot compile`,
            appPath,
            lines(
              'Paraglide compiles `messages/<locale>.json` against `project.inlang/settings.json`.',
              'Create both (snake_case keys) — the generated src/paraglide/ output is gitignored.'
            )
          )
        } else if (!usesMessages && srcFiles.length > 0) {
          w(
            `app-i18n-unused-${name}`,
            `apps/${name} ships Paraglide but no component imports from @/i18n or calls useLocale() — strings are not actually translated`,
            appPath,
            "Route user-visible strings through `m.*()` from '@/i18n/messages' and subscribe via `useLocale()`."
          )
        }

        if (!appAllDeps['@pikku/mantine'] && appAllDeps['@mantine/core']) {
          e(
            `app-missing-pikku-mantine-${name}`,
            `apps/${name} uses @mantine/core but not @pikku/mantine — components bypass the i18n-typed compile gate`,
            join(appPath, 'package.json'),
            'Add "@pikku/mantine": "^0.12.5" and import components from "@pikku/mantine/core" (a drop-in for @mantine/core with I18nNode-typed string props).'
          )
        }
        if (rawMantineFiles.length > 0) {
          e(
            `app-raw-mantine-imports-${name}`,
            `apps/${name} imports components from "@mantine/core" directly in ${rawMantineFiles.length} file(s) — this bypasses the @pikku/mantine i18n gate, so untranslated strings compile silently`,
            join(appPath, 'src'),
            lines(
              `Swap 'from "@mantine/core"' → 'from "@pikku/mantine/core"' in:`,
              ...rawMantineFiles.slice(0, 10).map((f) => `  - ${f}`),
              ...(rawMantineFiles.length > 10
                ? [`  …and ${rawMantineFiles.length - 10} more`]
                : []),
              'Keep "@mantine/core/styles.css", @mantine/hooks and @mantine/notifications imports as-is.'
            )
          )
        }
      }
    }

    // ── singleton-sensitive deps must resolve to ONE physical copy ─────────
    // A second physical copy of a peer-virtualized lib (or React) splits
    // module-level state and breaks TanStack Start dev SSR — the perauset
    // "Cannot GET /" 404. Invariant: one resolved install dir per package
    // across {app, root}. Best-effort: needs node_modules installed; anything
    // unresolvable is skipped.
    for (const name of appEntries) {
      const appPath = join(appsDir, name)
      if (!existsSync(join(appPath, 'package.json'))) continue
      for (const pkg of SINGLETON_SENSITIVE_PKGS) {
        const installDirs = new Set<string>()
        for (const base of [appPath, root]) {
          try {
            const resolved = createRequire(join(base, 'package.json')).resolve(
              pkg
            )
            const esc = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const m = resolved.match(
              new RegExp(`^(.*[\\\\/]node_modules[\\\\/]${esc})[\\\\/]`)
            )
            if (m) installDirs.add(m[1])
          } catch {
            // not resolvable from this base — skip
          }
        }
        if (installDirs.size > 1) {
          e(
            `dup-physical-copy-${name}-${pkg.replace(/[@/]/g, '-')}`,
            `apps/${name}: "${pkg}" resolves to ${installDirs.size} distinct physical copies — a module-singleton split (breaks TanStack Start dev SSR → frontend 404)`,
            appPath,
            lines(
              `"${pkg}" is installed more than once (e.g. one hoisted to the repo root and one nested under apps/${name}).`,
              `Declare "${pkg}" in exactly ONE workspace manifest (the root OR apps/${name}, not both), delete yarn.lock, and reinstall so it hoists to a single copy.`,
              '`resolutions` version-pins do NOT collapse a peer-virtualized duplicate.'
            )
          )
        }
      }
    }
  }

  // ── deprecated Next.js pikku client (dead codegen) ─────────────────────
  // The Next HTTP/backend client (`nextHTTPFile`/`nextBackendFile` → *.gen.ts)
  // is no longer emitted by pikku codegen — Fabric frontends use the fetch
  // client generated into the functions-sdk (PikkuFetch/PikkuRPC + createPikku).
  // The trap that bit heygermany's deploy: a frontend still imports the stale
  // `nextjs-*.gen` file. It is gitignored (so `git add -A` never pushes it) AND
  // `pikku all` no longer regenerates it — so it lingers on the dev's disk
  // (validate/tsc pass locally) but is ABSENT in the clean build container,
  // where tsc dies with "Cannot find module './nextjs-http.gen'" and aborts the
  // deploy. Flag both the dead config keys and any surviving import.
  {
    const DEAD_NEXT_KEYS = ['nextHTTPFile', 'nextBackendFile'] as const
    const rel = (p: string): string => p.slice(root.length + 1)

    const configPaths = [pikkuConfigPath]
    for (const group of ['apps', 'packages']) {
      const groupDir = join(root, group)
      if (!existsSync(groupDir)) continue
      try {
        for (const d of await readdir(groupDir, { withFileTypes: true })) {
          if (!d.isDirectory()) continue
          const cfg = join(groupDir, d.name, 'pikku.config.json')
          if (existsSync(cfg)) configPaths.push(cfg)
        }
      } catch {
        // ignore
      }
    }
    for (const cfgPath of configPaths) {
      const cfg = await readJsonSafe<Record<string, unknown>>(cfgPath)
      if (!cfg) continue
      const deadKeys = DEAD_NEXT_KEYS.filter((k) => cfg[k])
      if (deadKeys.length) {
        e(
          `dead-next-codegen-config-${rel(cfgPath).replace(/[^a-z0-9]/gi, '-')}`,
          `${rel(cfgPath)} declares ${deadKeys.join(', ')} — the Next.js pikku client is no longer generated by codegen, so the referenced *.gen file is gitignored + never regenerated and is absent in a clean build (tsc fails "Cannot find module")`,
          cfgPath,
          lines(
            `Remove the ${deadKeys.join('/')} key(s) and generate the fetch client into the functions-sdk instead:`,
            '"clientFiles": {',
            '  "fetchFile": "packages/functions-sdk/src/pikku/pikku-fetch.gen.ts",',
            '  "rpcWiringsFile": "packages/functions-sdk/src/pikku/pikku-rpc.gen.ts"',
            '}',
            'Then in the frontend: import { PikkuFetch } / { PikkuRPC } from "@<scope>/functions-sdk/pikku/..." and wire them with createPikku(PikkuFetch, PikkuRPC, { serverUrl }).'
          )
        )
      }
    }

    // Scan handwritten frontend/package source for imports of the dead client.
    const DEAD_IMPORT_RE =
      /['"][^'"]*\bnextjs-(?:http|backend)\.gen(?:\.[jt]sx?)?['"]/
    for (const group of ['apps', 'packages']) {
      const groupDir = join(root, group)
      if (!existsSync(groupDir)) continue
      let subdirs: string[] = []
      try {
        subdirs = (await readdir(groupDir, { withFileTypes: true }))
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      } catch {
        continue
      }
      for (const name of subdirs) {
        const wsPath = join(groupDir, name)
        for (const file of await walkSourceFiles(wsPath)) {
          const text = await readTextSafe(file)
          if (!text || !DEAD_IMPORT_RE.test(text)) continue
          e(
            `dead-next-client-import-${rel(file).replace(/[^a-z0-9]/gi, '-')}`,
            `${rel(file)} imports the deprecated Next.js pikku client (nextjs-http.gen / nextjs-backend.gen) — pikku no longer generates it and it is gitignored, so a clean build has no such module and tsc aborts the deploy with "Cannot find module"`,
            file,
            lines(
              'Replace the nextjs-*.gen import with the fetch client from the functions-sdk:',
              "  import { PikkuFetch } from '@<scope>/functions-sdk/pikku/pikku-fetch.gen'",
              "  import { PikkuRPC } from '@<scope>/functions-sdk/pikku/pikku-rpc.gen'",
              '  const pikku = createPikku(PikkuFetch, PikkuRPC, { serverUrl })',
              'Emit those files via pikku.config.json clientFiles (fetchFile/rpcWiringsFile) and remove nextHTTPFile/nextBackendFile.'
            )
          )
        }
      }
    }
  }

  // ── packages/theme + packages/components ──────────────────────────────
  const designDocUrl = 'https://pikkufabric.dev/docs/design'
  const themePkgDir = join(root, 'packages', 'mantine-theme')
  if (!existsSync(themePkgDir)) {
    info(
      'theme-missing',
      'packages/mantine-theme/ not found — Fabric design features require a theme package',
      themePkgDir,
      `Create packages/mantine-theme/ with your Mantine theme tokens. See ${designDocUrl}`
    )
  } else {
    // The Fabric console's Design tab lists a theme only when it can read a
    // themes/<id>.json spec (+ active.json pointing at one) — that spec is the
    // single source of truth the app runtime and the console both consume. A
    // package that only hand-writes createTheme() renders fine but the console
    // reports "no theme set" and cannot edit it. Mirror getSandboxThemes' file
    // logic (themes/<id>.json where id matches THEME_ID_RE, + active.json.id).
    const themeIdRe = /^[a-z][a-z0-9-]{0,38}$/
    const themesDir = join(themePkgDir, 'themes')
    let specIds: string[] = []
    if (existsSync(themesDir)) {
      try {
        specIds = (await readdir(themesDir))
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -'.json'.length))
          .filter((id) => themeIdRe.test(id))
      } catch {
        // readdir failure — treat as no specs
      }
    }
    if (specIds.length === 0) {
      info(
        'theme-no-spec',
        'packages/mantine-theme/ has no themes/<id>.json spec — the Fabric console Design tab reports "no theme set" (and cannot edit the theme) even if the app is branded via a hand-written createTheme()',
        themesDir,
        lines(
          'Add a theme spec the console can read:',
          '1. Create packages/mantine-theme/themes/<id>.json (id is kebab-case), e.g.:',
          '{',
          '  "name": "My Brand",',
          '  "brand": { "colors": { "primary": "#4f46e5" }, "fonts": { "body": "Inter" } },',
          '  "structure": { "defaultRadius": "md", "defaultColorScheme": "light" }',
          '}',
          '2. Create packages/mantine-theme/active.json: { "id": "<id>" }',
          '3. Build the Mantine theme from the active spec in index.ts.',
          `See ${designDocUrl}`
        )
      )
    } else {
      // A spec exists — active.json must point at one, else the console has no
      // active theme (getSandboxThemes falls back to a "default" id that may
      // not exist among the specs).
      const activePath = join(themePkgDir, 'active.json')
      const active = await readJsonSafe<{ id?: unknown }>(activePath)
      const activeId = typeof active?.id === 'string' ? active.id : null
      if (!activeId) {
        info(
          'theme-no-active',
          'packages/mantine-theme/active.json is missing or has no string "id" — the Fabric console falls back to the "default" theme id, which may not match any themes/<id>.json',
          activePath,
          lines(
            'Create packages/mantine-theme/active.json pointing at an existing spec:',
            `{ "id": "${specIds[0]}" }`
          )
        )
      } else if (!specIds.includes(activeId)) {
        info(
          'theme-active-mismatch',
          `packages/mantine-theme/active.json points at "${activeId}" but no themes/${activeId}.json exists — the Fabric console has no active theme`,
          activePath,
          lines(
            `Point active.json at an existing spec (${specIds.join(', ')}):`,
            `{ "id": "${specIds[0]}" }`
          )
        )
      }
    }
  }
  if (!existsSync(join(root, 'packages', 'components'))) {
    info(
      'components-missing',
      'packages/components/ not found — Fabric design features require a components package',
      join(root, 'packages', 'components'),
      `Create packages/components/ with your shared UI components. See ${designDocUrl}`
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
