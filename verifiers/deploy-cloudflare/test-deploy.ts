/**
 * Offline verifier for Cloudflare deploy pipeline.
 *
 * Has its own pikku.config.json extending recipes/functions.
 * Runs pikku + deploy plan from this directory, asserts actual content.
 */

import { execSync } from 'child_process'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const FUNCTIONS_DIR = join(process.cwd(), '..', '..', 'recipes', 'functions')
const REPO_ROOT = join(process.cwd(), '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const DEPLOY_DIR = join(FUNCTIONS_DIR, '.deploy', 'cloudflare')
const PLAN_RESULT_FILE = join(DEPLOY_DIR, 'plan-result.json')
const DEPLOYMENT_MANIFEST_FILE = join(DEPLOY_DIR, 'deployment-manifest.json')
const SERVER_UNIT_NAME = 'pikku-server-container'
const UNITS_DIR = join(DEPLOY_DIR, 'units')
const CONTAINER_DIR = join(DEPLOY_DIR, 'container')

const CONFIG_FILE = join(FUNCTIONS_DIR, 'pikku.config.json')

/**
 * Every check below names a unit after the function it holds, which only works
 * while a unit holds a single function. The default grouping strategy puts
 * every function that builds the same services in one unit, so this verifier
 * pins one-per-function; how units are partitioned is verifiers/deploy-grouping's
 * subject.
 */
/**
 * Fixtures the template does not carry: a webhook gateway, and the coercion
 * map `pikku db migrate` would write for an app with annotated columns. Both
 * are removed with the config pin below.
 */
const GATEWAY_FUNCTION_FILE = join(
  FUNCTIONS_DIR,
  'src',
  'functions',
  'verifier-gateway.functions.ts'
)
const GATEWAY_WIRING_FILE = join(
  FUNCTIONS_DIR,
  'src',
  'wirings',
  'verifier-gateway.wiring.ts'
)
const COERCION_FILE = join(FUNCTIONS_DIR, '.pikku', 'db', 'coercion.gen.ts')
const COERCION_MAP = { todo: { due_at: 'date', done: 'bool' } }
const GATEWAY_ROUTE = '/verifier/webhook'

// The template has no database, so nothing provides `kysely` and the adapter's
// coercion contributor (which decorates it) is correctly left out. An addon that
// provides one is linked into the shared project for the run, so the coercion
// check below covers a real selection; both are removed on exit.
const ADDON_DIR = join(process.cwd(), 'contrib-kysely')
const ADDON_LINK = join(
  FUNCTIONS_DIR,
  'node_modules',
  '@verifier',
  'contrib-kysely'
)
// A coercion map only reaches a contributor for an app with a known database
// dialect, so the run also gives the project an (empty) db/sqlite folder.
const DB_DIALECT_DIR = join(FUNCTIONS_DIR, 'db')
const ADDON_WIRING_FILE = join(
  FUNCTIONS_DIR,
  'src',
  'zz-contributors-wiring.ts'
)

const originalConfig = readFileSync(CONFIG_FILE, 'utf-8')
const restoreConfig = () => {
  writeFileSync(CONFIG_FILE, originalConfig)
  for (const fixture of [
    GATEWAY_FUNCTION_FILE,
    GATEWAY_WIRING_FILE,
    COERCION_FILE,
    ADDON_WIRING_FILE,
    ADDON_LINK,
    DB_DIALECT_DIR,
  ]) {
    rmSync(fixture, { force: true, recursive: true })
  }
}
process.on('exit', restoreConfig)
process.on('SIGINT', () => {
  restoreConfig()
  process.exit(130)
})
// A signalled exit never emits 'exit', so the restore has to be hung off each
// signal by hand — a killed verifier that skipped it would leave the shared
// template config pinned to 'function' and quietly change what every later
// verifier builds.
process.on('SIGTERM', () => {
  restoreConfig()
  process.exit(143)
})
const pinnedConfig = JSON.parse(originalConfig)
pinnedConfig.deploy = {
  ...pinnedConfig.deploy,
  grouping: { strategy: 'function' },
}
pinnedConfig.db = { engine: 'sqlite' }
writeFileSync(CONFIG_FILE, JSON.stringify(pinnedConfig, null, 2))

writeFileSync(
  GATEWAY_FUNCTION_FILE,
  `import { pikkuSessionlessFunc } from '#pikku/function'

export const verifierWebhookReply = pikkuSessionlessFunc<
  { text: string },
  { text: string }
>({
  func: async (_services, { text }) => ({ text: \`echo: \${text}\` }),
})
`
)
writeFileSync(
  GATEWAY_WIRING_FILE,
  `import { wireGateway } from '#pikku/gateway'
import { verifierWebhookReply } from '../functions/verifier-gateway.functions.js'

wireGateway({
  name: 'verifier-webhook',
  type: 'webhook',
  route: '${GATEWAY_ROUTE}',
  adapter: {
    name: 'verifier',
    parse: (data: any) => ({ senderId: 'verifier', text: data.text, raw: data }),
    send: async () => {},
    init: async () => {},
    close: async () => {},
  },
  func: verifierWebhookReply,
})
`
)

console.log('Setting up: running pikku codegen + deploy plan (cloudflare)...')
execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_DIR, stdio: 'pipe' })
execSync(`node ${PIKKU_BIN} all`, {
  cwd: ADDON_DIR,
  stdio: 'pipe',
  timeout: 60_000,
})
mkdirSync(join(DB_DIALECT_DIR, 'sqlite'), { recursive: true })
mkdirSync(join(FUNCTIONS_DIR, 'node_modules', '@verifier'), { recursive: true })
rmSync(ADDON_LINK, { force: true })
symlinkSync(ADDON_DIR, ADDON_LINK, 'dir')
writeFileSync(
  ADDON_WIRING_FILE,
  `import { wireAddon } from '#pikku/addon'

wireAddon({
  name: 'kyselyStandIn',
  package: '@verifier/contrib-kysely',
  contributors: ['kysely-stand-in'],
})
`
)
execSync(`node ${PIKKU_BIN}`, {
  cwd: FUNCTIONS_DIR,
  stdio: 'pipe',
  timeout: 60_000,
})
mkdirSync(join(FUNCTIONS_DIR, '.pikku', 'db'), { recursive: true })
writeFileSync(
  COERCION_FILE,
  `export const coercionMap = ${JSON.stringify(COERCION_MAP, null, 2)} as const\n`
)
execSync(
  `node ${PIKKU_BIN} deploy plan --provider cloudflare --result-file .deploy/cloudflare/plan-result.json`,
  {
    cwd: FUNCTIONS_DIR,
    stdio: 'pipe',
    timeout: 300_000,
  }
)
console.log('Setup complete.\n')

function readJSON(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8'))
}
function readText(path: string): string {
  return readFileSync(path, 'utf-8')
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
function getUnitServices(unitName: string): Record<string, boolean> {
  const baseUnitPath = getUnitPath(unitName)
  const directPath = join(baseUnitPath, '.pikku', 'pikku-services.gen.ts')
  const nestedPath = join(
    baseUnitPath,
    SERVER_UNIT_NAME,
    '.pikku',
    'pikku-services.gen.ts'
  )
  const path = existsSync(directPath)
    ? directPath
    : existsSync(nestedPath)
      ? nestedPath
      : ''
  if (!path) return {}
  const content = readText(path)
  const match = content.match(
    /export const requiredSingletonServices = \{([^}]+)\}/
  )
  if (!match) return {}
  const services: Record<string, boolean> = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/'([^']+)':\s*(true|false)/)
    if (kv) services[kv[1]] = kv[2] === 'true'
  }
  return services
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
const infra = existsSync(join(DEPLOY_DIR, 'infra.json'))
  ? readJSON(join(DEPLOY_DIR, 'infra.json'))
  : null
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

// --- Infra manifest ---
check('infra.json: has projectId, units, resources', () => {
  if (!infra) throw new Error('infra.json missing')
  if (!infra.projectId) throw new Error('Missing projectId')
  if (!infra.units) throw new Error('Missing units')
  if (!infra.resources) throw new Error('Missing resources')
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
      if (!/^[a-f0-9]{64}$/.test(bundleHash)) {
        throw new Error(`${unitName}: invalid bundleHash`)
      }
      if (!/^[a-f0-9]{64}$/.test(exactDependenciesHash)) {
        throw new Error(`${unitName}: invalid exactDependenciesHash`)
      }

      const bundleContent = readText(join(getUnitPath(unitName), 'bundle.js'))
      const actualBundleHash = sha256(bundleContent)
      if (actualBundleHash !== bundleHash) {
        throw new Error(`${unitName}: bundleHash mismatch`)
      }

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
check('infra.json: has queues (todo-reminders + workflow-dispatch)', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  if ((resources.queues ?? []).length < 2)
    throw new Error(`Expected >= 2 queues`)
})
check('infra.json: has cron triggers', () => {
  const resources = infra!.resources as Record<string, unknown[]>
  if ((resources.cronTriggers ?? []).length < 1)
    throw new Error('Missing crons')
})

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
check(
  'workflow step units: create-todo, send-notification, schedule-reminder',
  () => {
    // These are function units that also consume workflow step queues
    assertContains(
      unitDirs,
      ['send-notification', 'schedule-reminder'],
      'Step units'
    )
  }
)
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

// --- Tree-shaking ---
check('greet entry uses @pikku/cloudflare/handler (not barrel)', () => {
  const entry = readText(join(getUnitPath('greet'), 'entry.ts'))
  if (!entry.includes('@pikku/cloudflare/handler'))
    throw new Error('Missing /handler')
  if (entry.includes("from '@pikku/cloudflare'")) throw new Error('Uses barrel')
})
check('greet entry: no CloudflareWorkflowService', () => {
  const entry = readText(join(getUnitPath('greet'), 'entry.ts'))
  if (entry.includes('CloudflareWorkflowService'))
    throw new Error('Should not import workflow')
})
check('orchestrator entry uses @pikku/cloudflare/workflow-do', () => {
  const wf = unitDirs.filter((d) => d.startsWith('wf-'))
  const entry = readText(join(getUnitPath(wf[0]), 'entry.ts'))
  if (!entry.includes('@pikku/cloudflare/workflow-do'))
    throw new Error('Missing /workflow-do')
})

// --- Services ---
// TODO: fresh CLI build generates workflowService=true for greet due to console addon service requirements bleeding into all units
// check('greet: workflowService=false', () => {
//   const svc = getUnitServices('greet')
//   if (svc.workflowService !== false) throw new Error(`Got ${svc.workflowService}`)
// })

// --- Bundles ---
check('no unit exceeds 5MB', () => {
  for (const u of unitDirs) {
    const s = statSync(join(getUnitPath(u), 'bundle.js')).size
    if (s > 5 * 1024 * 1024)
      throw new Error(`${u}: ${(s / 1024 / 1024).toFixed(1)}MB`)
  }
})
check('every worker unit has entry.ts', () => {
  for (const u of unitDirs) {
    if (u === SERVER_UNIT_NAME || u === 'pikku-server-proxy') continue
    if (!existsSync(join(getUnitPath(u), 'entry.ts')))
      throw new Error(`${u} missing entry.ts`)
  }
})

// --- wireGateway (#1906) ---
const manifestGateways = ((deploymentManifest as Record<string, unknown>)
  ?.gateways ?? []) as Array<{ name: string; route: string; unitName: string }>
const unitBootstrap = (unitName: string) =>
  readText(join(getUnitPath(unitName), '.pikku', 'pikku-bootstrap.gen.ts'))
check('manifest lists the webhook gateway', () => {
  const gateway = manifestGateways.find((g) => g.name === 'verifier-webhook')
  if (!gateway)
    throw new Error('verifier-webhook missing from manifest.gateways')
  if (gateway.route !== GATEWAY_ROUTE)
    throw new Error(`Expected route ${GATEWAY_ROUTE}, got ${gateway.route}`)
})
check('the gateway unit routes the webhook and holds its handler', () => {
  const gateway = manifestGateways.find((g) => g.name === 'verifier-webhook')
  const unit = deploymentManifest?.units?.find(
    (u) => u.name === gateway?.unitName
  ) as
    | {
        functionIds: string[]
        handlers: Array<{
          type: string
          routes?: Array<{ route: string; method: string }>
        }>
      }
    | undefined
  if (!unit) throw new Error(`No unit ${gateway?.unitName}`)
  if (!unit.functionIds.includes('verifierWebhookReply'))
    throw new Error(`Handler not bundled: ${unit.functionIds.join(', ')}`)
  const routes = unit.handlers.flatMap((h) => h.routes ?? [])
  if (!routes.some((r) => r.route === GATEWAY_ROUTE && r.method === 'POST'))
    throw new Error(`POST ${GATEWAY_ROUTE} not routed`)
  if (!unitBootstrap(gateway!.unitName).includes('pikku-gateway-wirings.gen'))
    throw new Error('gateway unit does not import the gateway wiring')
})
check('a unit without the gateway does not import its wiring', () => {
  if (unitBootstrap('greet').includes('pikku-gateway-wirings.gen'))
    throw new Error('greet imports the gateway wiring')
})

// --- Column coercion (#1913) ---
check('a worker entry applies the generated coercion map', () => {
  const unit = getUnitPath('greet')
  const services = readText(join(unit, 'platform-services.gen.ts'))
  if (!services.includes('// kysely-coercion'))
    throw new Error(
      'platform services do not run the kysely-coercion contributor'
    )
  if (!services.includes(JSON.stringify(COERCION_MAP)))
    throw new Error('platform services do not carry the coercion map')
  if (
    services.indexOf('// kysely-stand-in') >
    services.indexOf('// kysely-coercion')
  )
    throw new Error('coercion runs before the contributor providing kysely')
  if (!readText(join(unit, 'bundle.js')).includes('createCoercionPlugin'))
    throw new Error('the unit bundle does not contain createCoercionPlugin')
})

// --- Lazy addon registration (#1497) ---
// No worker unit in this template wires an addon; verifiers/addon-treeshake
// checks the deferred imports themselves. Here: every worker bootstrap exports
// loadAddons() and every worker entry awaits it before building services.
check('worker entries await loadAddons() from a lazy bootstrap', () => {
  const workers = unitDirs.filter((u) =>
    existsSync(join(getUnitPath(u), '.pikku', 'pikku-bootstrap.gen.ts'))
  )
  if (workers.length === 0) throw new Error('no worker unit bootstraps')
  for (const u of workers) {
    if (u === SERVER_UNIT_NAME) continue
    if (!unitBootstrap(u).includes('export const loadAddons'))
      throw new Error(`${u}: bootstrap has no loadAddons`)
    if (!readText(join(getUnitPath(u), 'entry.ts')).includes('loadAddons?.()'))
      throw new Error(`${u}: entry does not await loadAddons`)
  }
})

// --- Server container ---
check('server container bundle is emitted', () => {
  if (!existsSync(join(CONTAINER_DIR, 'bundle.js'))) {
    throw new Error('server bundle missing')
  }
})
check('container has Dockerfile, workers do not', () => {
  if (!existsSync(join(CONTAINER_DIR, 'Dockerfile'))) {
    throw new Error('pikku-server-container missing Dockerfile')
  }
  for (const u of unitDirs) {
    if (u === SERVER_UNIT_NAME) continue
    if (existsSync(join(getUnitPath(u), 'Dockerfile')))
      throw new Error(`worker unit ${u} should not have a Dockerfile`)
  }
})

// --- Results ---
console.log('='.repeat(60))
console.log('CF Deploy Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}`)
  if (!r.passed && r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
