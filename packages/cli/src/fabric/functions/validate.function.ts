import { z } from 'zod'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { added, changed, removed, dim } from '../lib/output.js'
import { typeCheckFrontends } from '../lib/frontend-typecheck.js'
import {
  readJsonSafe,
  readTextSafe,
  runSharedProjectChecks,
} from '../../functions/validate/shared-checks.js'
import { runTypeIdentityChecks } from '../../functions/validate/type-identity-checks.js'
import { migrationCreatesTable } from '../../functions/validate/shared-checks.js'
import { isGitRepo, isTracked } from '../lib/git.js'
import { blankComments, lineOfOffset } from '../lib/blank-comments.js'
import { blankScenarioMeta } from '../lib/blank-scenario-meta.js'

const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['error', 'warn', 'info']),
  message: z.string(),
  path: z.string(),
  fixHint: z.string(),
})
type Finding = z.infer<typeof FindingSchema>

export const FabricValidateInput = z.object({
  skipTypecheck: z
    .boolean()
    .optional()
    .describe(
      'Skip the frontend type-check stage (structural checks only, much faster)'
    ),
})

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

// A file whose name says "this is the login surface". Used to decide whether an
// app needs the actor quick-login control — an app with no login screen has
// nothing to attach it to. Matched against the path relative to the app root, so
// it covers src/pages/LoginPage.tsx as well as Next's app/login/page.tsx.
const LOGIN_FILE_PATTERN =
  /(?:^|\/)[\w[\]-]*(?:login|sign-?in)[\w[\]-]*(?:\/|\.)/i

// Fingerprints of the dev-only "Sign in as …" quick login (the actor switcher):
// one click signs in as a declared scenario persona, no password. Any one of
// these means the app actually wires actor sign-in — the component's own
// definition is excluded, since defining it without rendering it locks the
// reviewer out just as thoroughly.
//
// Canonical implementation is now `<DevActorSwitcher>` from `@pikku/mantine/dev`
// (built on `useDevActors` from `@pikku/react`), rendered from the login screen.
// The hand-rolled shape the templates used to copy — a local component backed by
// `signInAsActor()` → POST /auth/sign-in/actor — still passes: apps that predate
// the package keep working, and the useDevActors call site is matched for apps
// that want their own UI on the shared logic.
const ACTOR_QUICK_LOGIN_PATTERNS = [
  /<\s*DevActorSwitcher\b/,
  /(?<!function\s)\bsignInAsActor\s*\(/,
  /(?<!function\s)\buseDevActors\s*\(/,
  /\/auth\/sign-in\/actor/,
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
//   - @pikku/cloudflare < 0.12.20 imports '@pikku/core/internal', a subpath no
//     published @pikku/core exports, so every worker fails to resolve and the
//     deploy ends at "0 workers bundled (0B total)". The broken import is in
//     the dependency's own dist, which no source-level check can see.
const PIKKU_MIN_VERSIONS: Record<string, string> = {
  '@pikku/cli': '0.12.43',
  '@pikku/core': '0.12.34',
  '@pikku/cloudflare': '0.12.20',
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
  startDir = process.cwd(),
  opts: { skipTypecheck?: boolean } = {}
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

  // ── everything true of any pikku project ───────────────────────────────
  // Fabric validate is the app-project check plus the deploy-shaped checks. The
  // two used to be separate walks over the same project that duplicated sixteen
  // findings verbatim, and each carried checks the other lacked for no reason
  // anyone could name.
  //
  // knowledge: decisions/internals/one-project-shape-check-two-validators.md
  const shared = await runSharedProjectChecks(root)
  findings.push(...shared.findings)
  const { pikkuConfig, dbEngine } = shared
  const pikkuConfigPath = join(root, 'pikku.config.json')
  const rootPkgPath = join(root, 'package.json')
  const rootPkg = await readJsonSafe<{
    packageManager?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }>(rootPkgPath)

  // ── packageManager ─────────────────────────────────────────────────────
  // The build container is bun-only end to end — install, pikku codegen and
  // the frontend build all run under bun — and it refuses the repository
  // before cloning finishes if package.json declares anything else. Nothing
  // else in validate reads packageManager, so a yarn or pnpm project passed
  // every check here and then died on the first line of the deploy.
  {
    const declared = rootPkg?.packageManager
    if (!declared) {
      e(
        'package-manager-undeclared',
        'package.json does not declare "packageManager" — Fabric is bun-only and the build container aborts with "Unsupported packageManager"',
        rootPkgPath,
        lines(
          'Add it to the root package.json:',
          '  "packageManager": "bun@1.4.0"',
          'then run `bun install` to generate bun.lock and commit both.'
        )
      )
    } else if (!declared.startsWith('bun@')) {
      e(
        'package-manager-not-bun',
        `package.json declares packageManager "${declared}" — Fabric is bun-only and the build container aborts with "Unsupported packageManager"`,
        rootPkgPath,
        lines(
          'Set the root package.json to bun:',
          '  "packageManager": "bun@1.4.0"',
          'then migrate the lockfile:',
          '  bun install && rm -f yarn.lock pnpm-lock.yaml package-lock.json',
          'and commit bun.lock.'
        )
      )
    }
  }

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
  } else if (
    (await isGitRepo(root)) &&
    !(await isTracked('pikkufabric.config.json', root))
  ) {
    // An error, unlike the three states around it. Those describe a project
    // that has not been linked yet, which is a legitimate thing to validate.
    // This one is a project that *is* linked and still cannot deploy: the build
    // container clones the repository, so a config that exists only in the
    // working tree is absent the moment it matters. Locally everything passes;
    // remotely the deploy aborts with "pikkufabric.config.json not found in
    // repository root". Nothing downstream of here can detect that, which is
    // why it is caught at the one point that can.
    e(
      'fabric-config-untracked',
      'pikkufabric.config.json is not committed — deploy clones the repository, so the build container will not see it and aborts with "pikkufabric.config.json not found in repository root"',
      fabricConfigPath,
      lines(
        'Commit the file:',
        '  git add pikkufabric.config.json && git commit -m "chore: link to fabric"',
        'Then check it is not being excluded:',
        '  git check-ignore -v pikkufabric.config.json',
        'A .gitignore rule such as `*.config.json` or a broad `*.json` will swallow it.'
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
  for (const relPath of ['db/annotations.ts']) {
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
            `  bun add ${pkg}@^${floorStr}`,
            'Then run `bun install` and re-run `pikku fabric validate`.'
          )
        )
      }
    }
  }

  findings.push(...(await runTypeIdentityChecks(root)))

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

      // name → "<relative file>:<line>" of the first import that used it.
      const used = new Map<string, string>()
      for (const file of await listSourceFiles(join(dir, 'src'))) {
        if (/\.gen\.(ts|tsx)$/.test(file)) continue
        const raw = await readTextSafe(file)
        if (!raw) continue
        // Comments first, or prose becomes a dependency: `from "is fine"` in a
        // sentence is indistinguishable from an import to this regex.
        const txt = blankComments(raw)
        const re = /(?:from|import|require)\s*\(?\s*['"]([^'".#][^'"]*)['"]/g
        let m: RegExpExecArray | null
        while ((m = re.exec(txt))) {
          const spec = m[1]
          if (
            /\s/.test(spec) ||
            spec.startsWith('node:') ||
            spec.startsWith('bun:') ||
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
          if (!used.has(name)) {
            const where = `${relative(root, file).replace(/\\/g, '/')}:${lineOfOffset(raw, m.index)}`
            used.set(name, where)
          }
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
            ...missing.map(
              (n) => `  "${n}": "<version>"   (first used at ${used.get(n)})`
            ),
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

  // packages/functions/ presence, its package.json, ESM, zod and layout are all
  // asserted by runSharedProjectChecks — everything below is Fabric-specific.
  if (existsSync(fnDir)) {
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
      // Both patterns are required, and both are load-bearing: the `.js`-suffixed
      // key resolves a deep generated file, the bare wildcard resolves a leaf
      // name at that leaf's index. Node picks the longer suffix, so declaring
      // only one silently loses half the surface.
      const PIKKU_IMPORTS =
        'Add to "imports": { "#pikku/*.js": "./.pikku/*.ts", "#pikku/*": "./.pikku/*/index.ts" }'
      if (!fnPkg.imports?.['#pikku/*.js']) {
        e(
          'functions-pkg-missing-pikku-import',
          'packages/functions/package.json is missing "#pikku/*.js" in "imports" — wiring files that import e.g. "#pikku/pikku-fetch.gen.js" fail at runtime with "Cannot find module"',
          fnPkgPath,
          PIKKU_IMPORTS
        )
      }
      if (!fnPkg.imports?.['#pikku/*']) {
        e(
          'functions-pkg-missing-pikku-wildcard-import',
          'packages/functions/package.json is missing "#pikku/*" in "imports" — files that import a leaf such as "#pikku/function" fail at runtime with "Cannot find module"',
          fnPkgPath,
          PIKKU_IMPORTS
        )
      }

      // .pikku leaf index .js wrapper — the sandbox runs `pikku dev` via
      // bare Node.js (no tsx), which cannot load .ts files. Every .ts in
      // .pikku/ needs a matching .js wrapper. The sandbox entrypoint creates
      // these during provisioning but NOT on subsequent restarts after agent
      // edits — so after any restart pikku dev crashes with
      // "Cannot find module '#pikku/function'". Run `pikku fabric smoke`
      // to test locally; the smoke command recreates the wrappers automatically.
      {
        const leafDir = join(fnDir, '.pikku', 'function')
        const indexTs = join(leafDir, 'index.ts')
        const indexJs = join(leafDir, 'index.js')
        // A warning, not an error: the wrapper is gitignored and recreated by
        // the sandbox entrypoint and `fabric smoke`, so a freshly cloned or
        // freshly scaffolded project never has it. As an error, "validate must
        // pass clean" was unachievable from a clean checkout.
        if (existsSync(indexTs) && !existsSync(indexJs)) {
          w(
            'pikku-types-js-wrapper-missing',
            'packages/functions/.pikku/function/index.js is missing — the sandbox runs pikku dev via bare Node.js, which cannot load .ts files; without the .js wrapper it crashes with "Cannot find module \'#pikku/function\'" on every restart',
            indexTs,
            lines(
              'Create packages/functions/.pikku/function/index.js:',
              "  import './index.ts';",
              "  export * from './index.ts';",
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
          'Run `bun add @pikku/schema-cfworker` in packages/functions — must be in dependencies, not devDependencies'
        )
      }
      if (!fnPkg.dependencies?.['@pikku/kysely']) {
        e(
          'missing-pikku-kysely',
          '@pikku/kysely is not in packages/functions dependencies — every Cloudflare worker entry requires it (KyselySecretService)',
          fnPkgPath,
          'Run `bun add @pikku/kysely` in packages/functions — must be in dependencies, not devDependencies'
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
          'Run `bun add @pikku/ai-vercel` in packages/functions — must be in dependencies, not devDependencies'
        )
      }
      if (!fnPkg?.dependencies?.['@ai-sdk/openai-compatible']) {
        e(
          'missing-ai-sdk-openai-compatible',
          'Project declares agent units but @ai-sdk/openai-compatible is not in packages/functions dependencies',
          fnPkgPath,
          'Run `bun add @ai-sdk/openai-compatible` in packages/functions — must be in dependencies, not devDependencies'
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
          'Run `bun add ai` in packages/functions — must be in dependencies, not devDependencies'
        )
      }
    }

    // services.ts — its absence is reported by runSharedProjectChecks; what
    // Fabric adds is which dialect it builds and whether it reads process.env.
    const servicesPath = join(fnDir, 'src', 'services.ts')
    const servicesText = await readTextSafe(servicesPath)
    if (servicesText) {
      const usesKysely = /\bKysely\b/.test(servicesText)
      const usesLibsql =
        servicesText.includes('@pikku/kysely-sqlite') ||
        servicesText.includes('LibsqlWebDialect')
      const usesProcessEnv = /\bprocess\.env\.[A-Z_]/.test(servicesText)

      // Only a services.ts that BUILDS its own client can pick the wrong
      // dialect. The starter template takes kysely from injection (pikku dev
      // supplies node:sqlite, the Worker supplies libsql) and constructs
      // nothing — flagging it told every fresh scaffold to import a dialect it
      // must not use.
      const constructsKysely = /new\s+Kysely\s*[<(]/.test(servicesText)

      if (
        dbEngine !== 'postgres' &&
        usesKysely &&
        constructsKysely &&
        !usesLibsql
      ) {
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
          'Replace process.env.SOME_VAR with await variables.get("SOME_VAR") — declare the binding with defineVariable/defineSecret; process.env is fine for optional/non-secret config'
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

    // ── the coercion map has to reach a Kysely instance ──────────────────
    // `pikku db migrate` generates a CoercionMap from the `kind` entries in
    // db/annotations.ts, and nothing wires it up on the project's behalf. An
    // unwired map is invisible locally and fatal deployed: the dev sqlite
    // driver hydrates a TEXT date into a Date by itself, libsql on a stage
    // returns the raw string, and the generated schema types the column
    // `Date` either way — so tsc flags nothing and there is no failing local
    // test to write. It surfaces as `TypeError: e.getFullYear is not a
    // function` on the first deployed request. Booleans diverge more quietly
    // still: `1` from a stage where local gives `true`.
    const outDirRel =
      typeof pikkuConfig?.outDir === 'string' ? pikkuConfig.outDir : '.pikku'
    const coercionPath = join(root, outDirRel, 'db', 'coercion.gen.ts')
    const coercionText = await readTextSafe(coercionPath)
    // `{}` means no column declared a `kind`, so there is nothing to wire.
    if (coercionText && /:\s*"(date|boolean|json)"/.test(coercionText)) {
      const wired = (
        await Promise.all(
          (await walkSourceFiles(root)).map((f) => readTextSafe(f))
        )
      ).some((text) => text?.includes('createCoercionPlugin'))
      if (!wired) {
        e(
          'coercion-map-not-wired',
          `${join(outDirRel, 'db', 'coercion.gen.ts')} declares coercions that no Kysely instance applies`,
          coercionPath,
          lines(
            'Attach the plugin where the kysely singleton is created, in',
            'createSingletonServices:',
            '',
            "  import { createCoercionPlugin } from '@pikku/kysely'",
            "  import { coercionMap } from '#pikku/db/coercion.gen.js'",
            '',
            '  kysely: existingServices.kysely.withPlugin(',
            '    createCoercionPlugin({ map: coercionMap }),',
            '  )',
            '',
            'Without it a deployed stage returns raw strings and integers where',
            'the generated schema promises Date and boolean. The dev driver',
            'hydrates them for you, so this cannot fail locally.'
          )
        )
      }
    }

    const devSeedPath = join(
      root,
      'db',
      dbEngine === 'postgres' ? 'postgres-dev-seed.sql' : 'sqlite-dev-seed.sql'
    )
    // Info, not an error. The dev seed is replayed by `pikku db reset` and
    // never by a deploy, so a project whose data has correctly moved into a
    // migration — where anything a deployed stage needs has to live — no
    // longer needs this file, and was being failed for not carrying it.
    if (!existsSync(devSeedPath)) {
      const seedFile =
        dbEngine === 'postgres'
          ? 'db/postgres-dev-seed.sql'
          : 'db/sqlite-dev-seed.sql'
      const migrationsRel =
        dbEngine === 'postgres' ? 'db/postgres/' : 'db/sqlite/'
      info(
        'dev-seed-sql-missing',
        `${seedFile} not found — no dev seed will be applied by \`pikku db reset\``,
        devSeedPath,
        lines(
          `Optional. Add \`${seedFile}\` for rows you want locally and nowhere else;`,
          'it is replayed by `pikku db reset` against a freshly wiped database and',
          'is never applied to a deployed stage.',
          `Data a deployed stage needs is migration data — put it in ${migrationsRel}`,
          'rather than here, whatever it looks like.'
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
        ).some((sql) => !!sql && migrationCreatesTable(sql, 'audit'))

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
  }

  // ── declared frontends ────────────────────────────────────────────────
  // pikkufabric.config.json is unvalidated JSON, so every field below is a
  // claim, not a guarantee: a null entry or a non-string cwd used to throw on
  // property access and take down the whole validation run — the one thing that
  // was supposed to report the broken config. Shape-check the entries once here
  // and let the apps/ and type-check passes consume the narrowed list.
  const declaredFrontends: Array<{
    slug: string
    cwd: string
    dir: string
    deploy: boolean
  }> = []
  let hasMantineFrontend = false
  /** every syntactically valid cwd, including ones whose directory is missing */
  const declaredCwdList: string[] = []
  const rawFrontends = fabricConfig?.frontends
  if (
    rawFrontends !== undefined &&
    (!rawFrontends || typeof rawFrontends !== 'object')
  ) {
    e(
      'frontends-invalid',
      'pikkufabric.config.json "frontends" is not an object — no frontend will be built or type-checked',
      fabricConfigPath,
      `Set "frontends" to an object keyed by slug: { "app": { "cwd": "apps/app", "kind": "ssr" } }`
    )
  } else if (rawFrontends) {
    for (const [slug, entry] of Object.entries(
      rawFrontends as Record<string, unknown>
    )) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        e(
          `frontend-entry-invalid-${slug}`,
          `pikkufabric.config.json frontend "${slug}" is not an object`,
          fabricConfigPath,
          `Give "${slug}" an object value: { "cwd": "apps/${slug}", "kind": "ssr" }`
        )
        continue
      }
      const { cwd, deploy } = entry as { cwd?: unknown; deploy?: unknown }
      if (typeof cwd !== 'string' || cwd.trim() === '') {
        e(
          `frontend-cwd-invalid-${slug}`,
          `pikkufabric.config.json frontend "${slug}" has no string "cwd" — the build container has nothing to build`,
          fabricConfigPath,
          `Set "cwd" to the app directory, e.g. { "${slug}": { "cwd": "apps/${slug}" } }`
        )
        continue
      }
      const rel = cwd.replace(/^\.\//, '')
      declaredCwdList.push(rel)
      const dir = join(root, rel)
      if (!existsSync(dir)) {
        // Reported here rather than inside the apps/ block below: a project
        // without an apps/ directory used to validate cleanly while declaring a
        // deployable frontend that does not exist.
        e(
          `frontend-cwd-missing-${slug}`,
          `fabric.config.json frontend "${slug}" declares cwd "${rel}" but that directory does not exist`,
          dir,
          `Create the directory or update the cwd in fabric.config.json`
        )
        continue
      }
      declaredFrontends.push({ slug, cwd: rel, dir, deploy: deploy !== false })
    }
  }

  const LOCALHOST_URL_RE =
    /['"`](?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^'"`]*['"`]/
  const ENV_FALLBACK_RE =
    /(?:import\.meta\.env|process\.env)\s*(?:\.\w+|\[\s*['"][^'"]+['"]\s*\])\s*(?:\?\?|\|\|)\s*['"`](?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/
  const API_ENV_READ_RE =
    /(?:import\.meta\.env|process\.env)\s*(?:\.(\w*(?:API|BACKEND|SERVER)\w*)|\[\s*['"](\w*(?:API|BACKEND|SERVER)\w*)['"]\s*\])/g

  for (const fe of declaredFrontends) {
    if (!fe.deploy) continue
    const files = [
      ...(await listSourceFiles(join(fe.dir, 'src'))),
      ...(await listSourceFiles(join(fe.dir, 'app'))),
      ...(await listSourceFiles(join(fe.dir, 'pages'))),
    ]
    const envFallbackHits: string[] = []
    const bareHits: string[] = []
    const apiEnvHits: string[] = []
    const apiEnvNames = new Set<string>()
    let derivesOrigin = false
    for (const file of files) {
      const rel = file.slice(fe.dir.length + 1).replace(/\\/g, '/')
      if (
        /\.(test|spec)\.[jt]sx?$/.test(rel) ||
        rel.endsWith('.d.ts') ||
        /(?:^|\/)(?:__tests__|__mocks__)\//.test(rel)
      ) {
        continue
      }
      const text = await readTextSafe(file)
      if (!text) continue
      if (/\blocation\s*\.\s*origin\b/.test(text)) derivesOrigin = true
      for (const raw of text.split('\n')) {
        const line = raw.trim()
        if (
          line.startsWith('//') ||
          line.startsWith('*') ||
          line.startsWith('/*')
        ) {
          continue
        }
        API_ENV_READ_RE.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = API_ENV_READ_RE.exec(line)) !== null) {
          apiEnvNames.add((m[1] ?? m[2])!)
          if (!apiEnvHits.includes(rel)) apiEnvHits.push(rel)
        }
        if (ENV_FALLBACK_RE.test(line)) {
          if (!envFallbackHits.includes(rel)) envFallbackHits.push(rel)
        } else if (LOCALHOST_URL_RE.test(line)) {
          if (!bareHits.includes(rel)) bareHits.push(rel)
        }
      }
    }
    const sample = (hits: string[]) =>
      hits.slice(0, 5).join(', ') +
      (hits.length > 5 ? `, +${hits.length - 5} more` : '')
    const originFix = lines(
      'Derive the base from the page instead of from a variable nobody sets:',
      '',
      '  const configured = import.meta.env.VITE_API_URL',
      '  const remote = !/^(localhost|127\\.0\\.0\\.1)$/.test(window.location.hostname)',
      '  // a localhost base served from a real origin is a stray dev value',
      '  if (configured && !(remote && /\\/\\/(localhost|127\\.0\\.0\\.1)(:|\\/)/.test(configured))) {',
      '    return configured',
      '  }',
      "  return window.location.origin + '/api'",
      '',
      'Fabric serves the app and the API on one hostname and routes /api/* to',
      'the API units, so the derived value is correct on every stage, preview',
      'and custom domain. Guard the `window` read for SSR.'
    )
    if (envFallbackHits.length > 0) {
      e(
        `frontend-env-fallback-localhost-${fe.slug}`,
        `frontend "${fe.slug}" defaults a build-time env read to a localhost URL (${sample(envFallbackHits)}) — the deploy sets no VITE_*/NEXT_PUBLIC_* variable at build time, so that fallback is what the production bundle ships and every call from a browser will time out`,
        fe.dir,
        originFix
      )
    } else if (apiEnvHits.length > 0 && !derivesOrigin) {
      e(
        `frontend-api-base-not-derived-${fe.slug}`,
        `frontend "${fe.slug}" takes its API base from ${[...apiEnvNames].sort().join(', ')} (${sample(apiEnvHits)}) and never derives it from the page origin — fabric binds VITE_API_URL on the deployed Worker at runtime, so the build inlines nothing and whatever follows the read is what ships`,
        fe.dir,
        originFix
      )
    }
    if (bareHits.length > 0 && !derivesOrigin) {
      e(
        `frontend-localhost-url-${fe.slug}`,
        `frontend "${fe.slug}" hardcodes a localhost URL (${sample(bareHits)}) — unreachable from any deployed page`,
        fe.dir,
        originFix
      )
    }
  }

  // ── apps/ vs fabric.config.json frontends ─────────────────────────────
  const appsDir = join(root, 'apps')

  if (existsSync(appsDir)) {
    // Check each app/ subdir is declared and has correct local deps
    let appEntries: string[] = []
    try {
      appEntries = (await readdir(appsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    } catch {
      /* ignore */
    }

    const declaredCwds = fabricConfig ? new Set(declaredCwdList) : null

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
      if (appAllDeps['@mantine/core'] || appAllDeps['@pikku/mantine']) {
        hasMantineFrontend = true
      }
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
          // local `@/i18n` scaffold (the typed `m` namespace) — either means
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

        // ── one-click actor sign-in (the "Sign in as …" quick login) ────────
        // Any frontend that ships a login screen must also ship the dev-only
        // actor switcher, so the app can be reviewed as each scenario persona
        // without knowing a password. Without it the reviewer is locked out of
        // their own sandbox. Only fires when a login surface exists — an app
        // with no auth has nothing to attach the control to.
        // Next.js keeps its routes outside src/, so scan app/ and pages/ too.
        const isNextApp = !!appAllDeps['next']
        const uiFiles = isNextApp
          ? [
              ...srcFiles,
              ...(await listSourceFiles(join(appPath, 'app'))),
              ...(await listSourceFiles(join(appPath, 'pages'))),
            ]
          : srcFiles

        const loginFiles: string[] = []
        let hasQuickLogin = false
        for (const file of uiFiles) {
          const text = await readTextSafe(file)
          if (!text) continue
          const rel = file.slice(appPath.length + 1).replace(/\\/g, '/')
          if (LOGIN_FILE_PATTERN.test(rel)) loginFiles.push(rel)
          if (ACTOR_QUICK_LOGIN_PATTERNS.some((p) => p.test(text))) {
            hasQuickLogin = true
          }
        }

        if (loginFiles.length > 0 && !hasQuickLogin) {
          e(
            `app-missing-actor-quick-login-${name}`,
            `apps/${name} has a login screen (${loginFiles[0]}) but no one-click actor sign-in — nobody can view the app as a scenario persona without a password`,
            join(appPath, loginFiles[0]!),
            lines(
              'Render the dev-only "Sign in as …" switcher from the login screen.',
              `In ${loginFiles[0]}:`,
              "  import { DevActorSwitcher } from '@pikku/mantine/dev'",
              '  <DevActorSwitcher',
              '    actors={import.meta.env.DEV ? import.meta.env.VITE_DEV_ACTORS : undefined}',
              '    secrets={import.meta.env.DEV ? import.meta.env.VITE_DEV_ACTOR_SECRETS : undefined}',
              '    apiUrl={apiUrl()}',
              "    onSignedIn={() => navigate({ to: '/' })}",
              '  />',
              'Both env vars are baked from your declared personas by whatever',
              'starts the frontend: a hosted sandbox dev server does it for you, a',
              "local runner (the starter's scripts/dev.mjs) has to do it itself —",
              'if the switcher renders nothing locally, that is the missing half.',
              'Neither is set in production, so the control renders null there.',
              'VITE_DEV_ACTOR_SECRETS is one credential per persona, each accepted for',
              'that persona only. Gate the reads on import.meta.env.DEV as above so no',
              'credential reaches a production bundle. Next.js reads the NEXT_PUBLIC_* pair.',
              'For custom UI, build on useDevActors() from @pikku/react instead.'
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
              `Declare "${pkg}" in exactly ONE workspace manifest (the root OR apps/${name}, not both), delete bun.lock, and reinstall so it hoists to a single copy.`,
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

  // ── scenario steps must locate by i18n key, not rendered copy ──────────
  // A browser step that says getByLabel('Full Name') passes only while the app
  // happens to render the base locale, and a copy edit breaks it as a timeout
  // on a selector — the failure points at the wizard rather than at the rename
  // that caused it. Any literal in a step file that is verbatim a value in the
  // base catalogue is that mistake: the catalogue already holds the string
  // under a key the test can read. Comments are stripped first, because the
  // prose around a step quotes the copy it is explaining.
  {
    const relFile = (p: string): string =>
      p.slice(root.length + 1).replace(/\\/g, '/')

    const keysByValue = new Map<string, string[]>()
    const appsRoot = join(root, 'apps')
    if (existsSync(appsRoot)) {
      for (const ent of await readdir(appsRoot, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue
        const appPath = join(appsRoot, ent.name)
        const settingsPath = join(appPath, 'project.inlang', 'settings.json')
        const settings = await readJsonSafe<{
          baseLocale?: string
          locales?: unknown
        }>(settingsPath)
        if (!settings) continue

        // `baseLocale` names the message SOURCE — the catalogue every other
        // locale is cloned from and translated against — not the language the
        // app is served in. Pointing it at the product's language looks right,
        // because the app does come up in that language, and quietly makes the
        // project single-language forever: there is no en.json to add a locale
        // from, and repointing it later re-authors every key. The setting that
        // decides what a first-time visitor opens in is active.json's
        // defaultLocale, which is a separate file for exactly this reason.
        const baseLocale = settings.baseLocale ?? 'en'
        if (baseLocale !== 'en') {
          const declared = Array.isArray(settings.locales)
            ? settings.locales.filter((l): l is string => typeof l === 'string')
            : []
          w(
            `app-base-locale-not-english-${ent.name}`,
            `apps/${ent.name}/project.inlang/settings.json sets baseLocale to "${baseLocale}" — that names the message source, not the language the app is served in, so this app has no English catalogue to add a second language from`,
            settingsPath,
            lines(
              'Serving the app in a language is a different setting from authoring the messages in one:',
              `  1. settings.json: { "baseLocale": "en", "locales": ["en", "${baseLocale}"] }`,
              `  2. src/i18n/active.json: { "defaultLocale": "${baseLocale}" }  (or: fabric i18n --default-locale ${baseLocale})`,
              `Keys and their English values stay in messages/en.json; messages/${baseLocale}.json holds the ${baseLocale} values.`,
              ...(declared.length && !declared.includes('en')
                ? [
                    `Note this is a re-key, not a rename: messages/${baseLocale}.json is currently the source, so its keys have to survive the move.`,
                  ]
                : []),
              'Identifiers are unaffected either way — functions, components, types, tables and columns are English in every project.'
            )
          )
        }

        const catalogue = await readJsonSafe<Record<string, unknown>>(
          join(appPath, 'messages', `${baseLocale}.json`)
        )
        if (!catalogue) continue
        for (const [key, value] of Object.entries(catalogue)) {
          if (typeof value !== 'string' || value.trim().length < 2) continue
          const owners = keysByValue.get(value) ?? []
          owners.push(key)
          keysByValue.set(value, owners)
        }
      }
    }

    if (keysByValue.size > 0) {
      const STRING_LITERAL =
        /(?<![A-Za-z0-9_$])(['"])((?:[^\\\n]|\\.){2,200}?)\1/g
      // A literal in `someKey: '...'` position is only copy when the key names
      // something the browser renders. `unit: 'kg'` is an RPC payload field that
      // happens to read like the catalogue's `unit_kg` label for a form suffix —
      // rewriting it to a message lookup would bind a stored value to UI copy.
      const PROPERTY_KEY = /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*$/
      // The innermost call whose argument list `index` sits in. Walks back
      // balancing brackets, so in `expect(await page.getByText('Save'), ...)`
      // the literal belongs to `getByText`, which is a locator and is still
      // scanned.
      const enclosingCall = (code: string, index: number): string | null => {
        let depth = 0
        for (let i = index - 1; i >= 0; i--) {
          const ch = code[i]!
          if (ch === ')' || ch === ']' || ch === '}') depth++
          else if (ch === '(' || ch === '[' || ch === '{') {
            if (depth > 0) {
              depth--
              continue
            }
            if (ch !== '(') return null
            return (
              /([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(code.slice(0, i))?.[1] ??
              null
            )
          }
        }
        return null
      }
      const UI_TEXT_KEYS = new Set([
        'alt',
        'button',
        'caption',
        'heading',
        'label',
        'link',
        'name',
        'option',
        'placeholder',
        'tab',
        'text',
        'title',
        'value',
      ])
      for (const file of await walkSourceFiles(root)) {
        if (!/\.(steps|scenario)\.tsx?$/.test(file)) continue
        const text = await readTextSafe(file)
        if (!text) continue
        // Comments carry the copy they explain; a feature's own name and
        // description are Console meta authored in the project's locale, not
        // app copy. Neither reaches the DOM, so neither is a selector.
        const code = blankScenarioMeta(blankComments(text))
        const hits: string[] = []
        for (const match of code.matchAll(STRING_LITERAL)) {
          const literal = match[2]
          if (!literal) continue
          const keys = keysByValue.get(literal)
          if (!keys) continue
          // `expect(item.unit, 'kg')` asserts on a value the RPC returned,
          // not on anything the browser rendered. Reading it from the
          // catalogue would bind a stored value to UI copy, and the assertion
          // would then pass against whatever the label happened to say.
          if (enclosingCall(code, match.index) === 'expect') continue
          const property = PROPERTY_KEY.exec(code.slice(0, match.index))
          if (property && !UI_TEXT_KEYS.has(property[1]!)) continue
          hits.push(`"${literal}" → ${keys.join(' | ')}`)
        }
        if (hits.length === 0) continue
        e(
          `scenario-hardcoded-copy-${relFile(file).replace(/[^a-z0-9]/gi, '-')}`,
          `${relFile(file)} hardcodes ${hits.length} string(s) the message catalogue already owns — the step passes only while the app renders the base locale, and a copy edit breaks it as an unexplained selector timeout`,
          file,
          lines(
            'Read each string from the catalogue instead of repeating it:',
            ...hits.slice(0, 10).map((h) => `  - ${h}`),
            ...(hits.length > 10 ? [`  …and ${hits.length - 10} more`] : []),
            'Type the lookup off the catalogue so a renamed key is a compile error:',
            "  import type messages from '<app>/messages/<baseLocale>.json'",
            '  export type MessageKey = keyof typeof messages'
          )
        )
      }
    }
  }

  // ── packages/theme + packages/components ──────────────────────────────
  const designDocUrl = 'https://pikkufabric.dev/docs/design'
  const designSeverity = hasMantineFrontend ? w : info
  const themePkgDir = join(root, 'packages', 'mantine-theme')
  if (!existsSync(themePkgDir)) {
    designSeverity(
      'theme-missing',
      hasMantineFrontend
        ? 'packages/mantine-theme/ not found — the Fabric console Design tab has no themes to list and reports "No themes yet"'
        : 'packages/mantine-theme/ not found — Fabric design features require a theme package',
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
      designSeverity(
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
  // The design server globs stories from apps/*/src/components, not packages/components.
  const storyFiles: string[] = []
  let hasComponentKit = false
  for (const name of existsSync(appsDir) ? await readdir(appsDir) : []) {
    const kitDir = join(appsDir, name, 'src', 'components')
    if (!existsSync(kitDir)) continue
    hasComponentKit = true
    for (const file of await listSourceFiles(kitDir)) {
      if (file.endsWith('.stories.tsx')) storyFiles.push(file)
    }
  }
  if (hasComponentKit && storyFiles.length === 0) {
    designSeverity(
      'design-no-stories',
      "no apps/*/src/components/**/*.stories.tsx found — the Fabric console Design tab's Library and App lenses have nothing to show",
      join(appsDir, '*', 'src', 'components'),
      lines(
        'Add a story beside a component. The Library lens reads <Name>.stories.tsx',
        '(each named export is a visual variant); the App lens reads',
        '<Name>.app.stories.tsx (each named export is one data state of the query',
        'or mutation the page drives it with). A minimal Library story:',
        '',
        "  import type { Story, StoryMeta } from './csf.types'",
        "  import { Wordmark } from './Wordmark'",
        '',
        '  export default {',
        "    title: 'Wordmark',",
        '    component: Wordmark,',
        '  } satisfies StoryMeta',
        '',
        "  export const Default: Story = { args: { name: 'Acme' } }",
        `See ${designDocUrl}`
      )
    )
  }

  // ── frontend type-check (what the build container actually runs) ───────
  // Every check above is a heuristic standing in for this compile. The build
  // container type-checks each deployable frontend and aborts the deploy on a
  // non-zero exit, so running the same compile here is the difference between
  // a 20-second local failure and a burned deploy out of the daily 10.
  if (!opts.skipTypecheck) {
    const frontends = declaredFrontends
      .filter((fe) => fe.deploy)
      .map((fe) => ({ name: fe.slug, dir: fe.dir }))

    for (const result of await typeCheckFrontends(root, frontends)) {
      if (result.skipped) {
        w(
          `frontend-typecheck-skipped-${result.name}`,
          `could not type-check frontend "${result.name}" — ${result.skipped}`,
          result.dir,
          lines(
            'The build container type-checks every deployable frontend and aborts the deploy if it fails.',
            'Give the app a tsconfig.json and a "tsc" script so the same check runs locally.'
          )
        )
        continue
      }
      if (result.errors.length === 0) continue
      const shown = result.errors.slice(0, 20)
      const extra = result.errors.length - shown.length
      e(
        `frontend-typecheck-${result.name}`,
        `frontend "${result.name}" does not type-check — the build container aborts the deploy on this`,
        result.dir,
        lines(
          ...shown,
          ...(extra > 0 ? [`… and ${extra} more`] : []),
          '',
          `Reproduce with: cd ${result.dir.slice(root.length + 1)} && ${result.command}`
        )
      )
    }
  }

  const ok = !findings.some((f) => f.severity === 'error')
  return { ok, root, findings }
}

export const FabricValidate = pikkuSessionlessFunc({
  description:
    'Check the current project structure for fabric compatibility. Prints all missing or misconfigured items with fix hints so an AI agent or developer can resolve them.',
  input: FabricValidateInput,
  output: FabricValidateOutput,
  func: async (_services, { skipTypecheck }) =>
    runValidate(process.cwd(), { skipTypecheck }),
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
    // "can be linked" is not "will deploy", and conflating them is how a green
    // validate is followed straight by a failed deploy. The three
    // fabric-config findings are info on purpose — an unlinked project is
    // still worth validating — but reporting unqualified success while the
    // build container is guaranteed to abort on a missing config is the part
    // that misleads. So the success line says which of the two it earned.
    const notLinked = findings.find((f) =>
      [
        'fabric-config-missing',
        'fabric-config-no-project-id',
        'fabric-config-placeholder-project-id',
      ].includes(f.id)
    )
    if (notLinked) {
      console.log(
        added('✓') +
          '  ' +
          dim(
            'no errors — but the project is not linked, so it cannot deploy yet'
          )
      )
      console.log(
        '   ' +
          dim(
            `${notLinked.message.split(' — ')[0]}. Run \`pikku fabric link\`.`
          )
      )
    } else {
      console.log(
        added('✓') + '  ' + dim('no errors — project can be linked to fabric')
      )
    }
  }
}
