/**
 * Offline verifier for Serverless (AWS Lambda) deploy pipeline.
 *
 * Has its own pikku.config.json extending templates/functions.
 * Runs pikku + deploy plan from this directory, asserts actual content.
 */

import { execSync } from 'child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const FUNCTIONS_DIR = join(process.cwd(), '..', '..', 'templates', 'functions')
const REPO_ROOT = join(process.cwd(), '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const DEPLOY_DIR = join(FUNCTIONS_DIR, '.deploy', 'serverless')
const PLAN_RESULT_FILE = join(DEPLOY_DIR, 'plan-result.json')
const DEPLOYMENT_MANIFEST_FILE = join(DEPLOY_DIR, 'deployment-manifest.json')
const SERVER_UNIT_NAME = 'pikku-server-container'
const UNITS_DIR = join(DEPLOY_DIR, 'units')
const CONTAINER_DIR = join(DEPLOY_DIR, 'container')

console.log('Setting up: running pikku codegen + deploy plan (serverless)...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_DIR, stdio: 'pipe' })
execSync(`node ${PIKKU_BIN}`, {
  cwd: FUNCTIONS_DIR,
  stdio: 'pipe',
  timeout: 60_000,
})
execSync(
  // --debug-artifacts emits per-unit metafiles for the tree-shaking checks below.
  `node ${PIKKU_BIN} deploy plan --provider serverless --debug-artifacts --result-file .deploy/serverless/plan-result.json`,
  {
    cwd: FUNCTIONS_DIR,
    stdio: 'pipe',
    timeout: 300_000,
  }
)
console.log('Setup complete.\n')

function readText(path: string): string {
  return readFileSync(path, 'utf-8')
}
function readJSON(path: string): Record<string, unknown> {
  return JSON.parse(readText(path))
}
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}
function getUnitDirs(): string[] {
  if (!existsSync(UNITS_DIR)) return []
  const dirs = readdirSync(UNITS_DIR).filter((d) => {
    const p = join(UNITS_DIR, d)
    return statSync(p).isDirectory() && existsSync(join(p, 'bundle.js'))
  })
  if (existsSync(join(CONTAINER_DIR, 'bundle.js'))) {
    dirs.push(SERVER_UNIT_NAME)
  }
  return dirs
}
function getUnitPath(unitName: string): string {
  return unitName === SERVER_UNIT_NAME
    ? CONTAINER_DIR
    : join(UNITS_DIR, unitName)
}

let failures = 0
const results: Array<{ name: string; passed: boolean; error?: string }> = []
function check(name: string, fn: () => void) {
  try {
    fn()
    results.push({ name, passed: true })
  } catch (e) {
    failures++
    results.push({ name, passed: false, error: (e as Error).message })
  }
}
function assertContains(actual: string[], expected: string[], label: string) {
  const missing = expected.filter((e) => !actual.includes(e))
  if (missing.length > 0)
    throw new Error(`${label}: missing [${missing.join(', ')}]`)
}

const unitDirs = getUnitDirs()
const planResult = existsSync(PLAN_RESULT_FILE)
  ? (readJSON(PLAN_RESULT_FILE) as {
      success?: boolean
      artifacts?: { deploymentManifestPath?: string }
    })
  : null
const deploymentManifestPath =
  typeof planResult?.artifacts?.deploymentManifestPath === 'string' &&
  existsSync(planResult.artifacts.deploymentManifestPath)
    ? planResult.artifacts.deploymentManifestPath
    : existsSync(DEPLOYMENT_MANIFEST_FILE)
      ? DEPLOYMENT_MANIFEST_FILE
      : null
const deploymentManifest = deploymentManifestPath
  ? (readJSON(deploymentManifestPath) as {
      units?: Array<Record<string, unknown>>
    })
  : null

// --- serverless.yml ---
check('serverless.yml: has provider + functions sections', () => {
  const yml = readText(join(DEPLOY_DIR, 'serverless.yml'))
  if (!yml.includes('provider:')) throw new Error('Missing provider')
  if (!yml.includes('functions:')) throw new Error('Missing functions')
})
check('serverless.yml: references greet, list-todos, update-todo', () => {
  const yml = readText(join(DEPLOY_DIR, 'serverless.yml'))
  for (const n of ['greet', 'list-todos', 'update-todo']) {
    if (!yml.includes(n)) throw new Error(`Missing: ${n}`)
  }
})
check('serverless.yml: has todo-reminders queue', () => {
  const yml = readText(join(DEPLOY_DIR, 'serverless.yml'))
  if (!yml.includes('todo-reminders')) throw new Error('Missing todo-reminders')
})
check('serverless.yml: has schedule events', () => {
  const yml = readText(join(DEPLOY_DIR, 'serverless.yml'))
  if (!yml.includes('schedule') && !yml.includes('cron'))
    throw new Error('Missing schedule')
})
check('plan-result.json: success + deployment manifest units', () => {
  if (!planResult) throw new Error('Missing plan-result.json')
  if (planResult.success !== true)
    throw new Error('Plan result is not success=true')
  const units = deploymentManifest?.units ?? []
  if (units.length === 0) throw new Error('No manifest units in plan result')
})
check(
  'plan manifest: bundle/exact dependency hashes are present + valid',
  () => {
    const units = deploymentManifest?.units ?? []
    if (units.length === 0) throw new Error('No manifest units to validate')

    for (const u of units) {
      const unitName = String(u.name ?? '')
      const bundleHash = String(u.bundleHash ?? '')
      const exactDependenciesHash = String(u.exactDependenciesHash ?? '')
      const exactDependencies = (u.exactDependencies ?? {}) as Record<
        string,
        string
      >
      const exactOptionalDependencies = (u.exactOptionalDependencies ??
        {}) as Record<string, string>
      if (!/^[a-f0-9]{64}$/.test(bundleHash))
        throw new Error(`${unitName}: invalid bundleHash`)
      if (!/^[a-f0-9]{64}$/.test(exactDependenciesHash)) {
        throw new Error(`${unitName}: invalid exactDependenciesHash`)
      }

      const bundleContent = readText(join(getUnitPath(unitName), 'bundle.js'))
      if (sha256(bundleContent) !== bundleHash)
        throw new Error(`${unitName}: bundleHash mismatch`)

      const pkg = readJSON(join(getUnitPath(unitName), 'package.json')) as {
        dependencies?: Record<string, string>
        optionalDependencies?: Record<string, string>
      }
      const deps = pkg.dependencies ?? {}
      const optionalDeps = pkg.optionalDependencies ?? {}
      const depsHash = sha256(
        JSON.stringify({
          dependencies: Object.entries(deps).sort(([a], [b]) =>
            a.localeCompare(b)
          ),
          optionalDependencies: Object.entries(optionalDeps).sort(([a], [b]) =>
            a.localeCompare(b)
          ),
        })
      )
      if (depsHash !== exactDependenciesHash) {
        throw new Error(`${unitName}: exactDependenciesHash mismatch`)
      }

      const expectedDependencies = JSON.stringify(
        Object.fromEntries(
          Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))
        )
      )
      const actualDependencies = JSON.stringify(
        Object.fromEntries(
          Object.entries(exactDependencies).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      )
      if (actualDependencies !== expectedDependencies) {
        throw new Error(`${unitName}: exactDependencies payload mismatch`)
      }

      const expectedOptionalDependencies = JSON.stringify(
        Object.fromEntries(
          Object.entries(optionalDeps).sort(([a], [b]) => a.localeCompare(b))
        )
      )
      const actualOptionalDependencies = JSON.stringify(
        Object.fromEntries(
          Object.entries(exactOptionalDependencies).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      )
      if (actualOptionalDependencies !== expectedOptionalDependencies) {
        throw new Error(
          `${unitName}: exactOptionalDependencies payload mismatch`
        )
      }

      const exactDepsFile = readJSON(
        join(getUnitPath(unitName), 'exact-dependencies.json')
      ) as {
        dependencies?: Record<string, string>
        optionalDependencies?: Record<string, string>
      }
      const fileDeps = JSON.stringify(
        Object.fromEntries(
          Object.entries(exactDepsFile.dependencies ?? {}).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      )
      const fileOptionalDeps = JSON.stringify(
        Object.fromEntries(
          Object.entries(exactDepsFile.optionalDependencies ?? {}).sort(
            ([a], [b]) => a.localeCompare(b)
          )
        )
      )
      if (fileDeps !== actualDependencies) {
        throw new Error(
          `${unitName}: exact-dependencies.json dependencies mismatch`
        )
      }
      if (fileOptionalDeps !== actualOptionalDependencies) {
        throw new Error(
          `${unitName}: exact-dependencies.json optionalDependencies mismatch`
        )
      }
    }
  }
)

// --- Units ---
check('HTTP units: greet, list-todos, update-todo', () => {
  assertContains(unitDirs, ['greet', 'list-todos', 'update-todo'], 'HTTP')
})
check('server unit exists for server-target functions', () => {
  assertContains(unitDirs, [SERVER_UNIT_NAME], 'Server')
})
check('scheduled units: daily-summary, weekly-cleanup', () => {
  assertContains(unitDirs, ['daily-summary', 'weekly-cleanup'], 'Scheduled')
})
check('MCP server unit', () => {
  assertContains(unitDirs, ['mcp-server'], 'MCP')
})
check('workflow orchestrators (>= 2)', () => {
  const wf = unitDirs.filter((d) => d.startsWith('wf-'))
  if (wf.length < 2) throw new Error(`Got: ${wf.join(', ')}`)
})
check('channel units (>= 1)', () => {
  const ch = unitDirs.filter((d) => d.startsWith('channel-'))
  if (ch.length < 1) throw new Error(`Got ${ch.length}`)
})
check('workflow step units: send-notification, schedule-reminder', () => {
  assertContains(
    unitDirs,
    ['send-notification', 'schedule-reminder'],
    'Step units'
  )
})
check('total units >= 29', () => {
  if (unitDirs.length < 29) throw new Error(`Got ${unitDirs.length}`)
})
check('plan manifest: server unit includes processReminder', () => {
  const units = deploymentManifest?.units ?? []
  const serverUnit = units.find((u) => u.name === SERVER_UNIT_NAME)
  if (!serverUnit) throw new Error('Missing server unit in manifest')
  const functionIds = (serverUnit.functionIds ?? []) as string[]
  if (
    !functionIds.some(
      (id) => id === 'processReminder' || id.startsWith('processReminder@')
    )
  ) {
    throw new Error('server unit missing processReminder')
  }
})

// --- Bundles ---
check('no unit exceeds 5MB', () => {
  for (const u of unitDirs) {
    const s = statSync(join(getUnitPath(u), 'bundle.js')).size
    if (s > 5 * 1024 * 1024)
      throw new Error(`${u}: ${(s / 1024 / 1024).toFixed(1)}MB`)
  }
})
check('every unit has entry.ts', () => {
  for (const u of unitDirs) {
    if (!existsSync(join(getUnitPath(u), 'entry.ts')))
      throw new Error(`${u} missing entry.ts`)
  }
})

// --- Bundle tree-shaking (what each unit actually bundles) ---
// Assert structurally (which modules contribute bytes), not as a KB number, that
// the AI SDK and the better-auth server stay out of units that don't use them.

/** Module paths that actually contribute bytes to a unit's bundle output. */
function bundledModules(unitName: string): string[] {
  const metafilePath = join(getUnitPath(unitName), 'metafile.json')
  if (!existsSync(metafilePath))
    throw new Error(`${unitName}: missing metafile.json (run with --debug-artifacts)`)
  const meta = readJSON(metafilePath) as {
    outputs?: Record<string, { inputs?: Record<string, { bytesInOutput?: number }> }>
  }
  const bundleKey = Object.keys(meta.outputs ?? {}).find(
    (k) => k.endsWith('bundle.js') && !k.endsWith('.map')
  )
  if (!bundleKey) throw new Error(`${unitName}: no bundle.js output in metafile`)
  const inputs = meta.outputs![bundleKey]!.inputs ?? {}
  return Object.entries(inputs)
    .filter(([, v]) => (v.bytesInOutput ?? 0) > 0)
    .map(([k]) => k)
}

const AI_SDK_RE = /@ai-sdk\/|\/node_modules\/ai\/|@pikku\/ai-vercel/
// Server-only better-auth modules — present in the auth handler, never needed to
// verify a signed cookie.
const BETTER_AUTH_SERVER_RE =
  /better-auth\/dist\/api\/routes\/|better-auth\/dist\/db\/internal-adapter|@better-auth\/core\/dist\/db\/adapter|@better-auth\/kysely-adapter|better-auth\/dist\/db\/schema\.|services\/better-auth\/dist\/auth-handler\.js|services\/better-auth\/dist\/auth-api\.js|services\/better-auth\/dist\/auth-session\.js$|services\/better-auth\/dist\/provider-registry|services\/better-auth\/dist\/plugin-registry/
// The lightweight stateless verifier every non-auth unit SHOULD carry.
const STATELESS_SESSION_RE =
  /services\/better-auth\/dist\/auth-session-stateless\.js|better-auth\/dist\/cookies\//

// A representative non-auth, non-AI HTTP unit.
const LEAN_UNIT = 'greet'
// The unit that legitimately bundles the full better-auth server.
const AUTH_UNIT = 'auth-handler'

check(`${LEAN_UNIT}: bundles zero AI SDK code`, () => {
  const hits = bundledModules(LEAN_UNIT).filter((m) => AI_SDK_RE.test(m))
  if (hits.length > 0)
    throw new Error(`unexpected AI modules: ${hits.slice(0, 5).join(', ')}`)
})

check(`${LEAN_UNIT}: bundles zero better-auth server code`, () => {
  const hits = bundledModules(LEAN_UNIT).filter((m) =>
    BETTER_AUTH_SERVER_RE.test(m)
  )
  if (hits.length > 0)
    throw new Error(`unexpected server modules: ${hits.slice(0, 5).join(', ')}`)
})

check(`${LEAN_UNIT}: still carries the stateless session verifier`, () => {
  // Guards against the split silently dropping session validation from non-auth
  // units (the regression that motivated this check).
  const hits = bundledModules(LEAN_UNIT).filter((m) =>
    STATELESS_SESSION_RE.test(m)
  )
  if (hits.length === 0)
    throw new Error('stateless session middleware missing from non-auth unit')
})

check(`${AUTH_UNIT}: bundles the full better-auth server (markers valid)`, () => {
  // Anti-tautology: prove the server markers actually match real modules
  // somewhere, so the LEAN_UNIT "zero server code" check can't pass trivially.
  if (!unitDirs.includes(AUTH_UNIT))
    throw new Error(`${AUTH_UNIT} unit not found`)
  const hits = bundledModules(AUTH_UNIT).filter((m) =>
    BETTER_AUTH_SERVER_RE.test(m)
  )
  if (hits.length === 0)
    throw new Error('auth handler unexpectedly has no server modules')
})

// --- Results ---
console.log('='.repeat(60))
console.log('Serverless Deploy Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
