/**
 * Offline verifier for `deploy.grouping`.
 *
 * Runs a real `pikku` + `deploy plan` against templates/functions three times —
 * ungrouped, grouped by tag, and with a grouping that spans deploy targets —
 * and asserts on the manifest and the bundles that actually got built. The unit
 * tests cover the resolver in isolation; this covers everything downstream of
 * it, which is where the assumptions a unit test mocks away break.
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(process.cwd(), '..', '..')
const FUNCTIONS_DIR = join(REPO_ROOT, 'templates', 'functions')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const CONFIG_FILE = join(FUNCTIONS_DIR, 'pikku.config.json')
const DEPLOY_DIR = join(FUNCTIONS_DIR, '.deploy', 'cloudflare')
const MANIFEST_FILE = join(DEPLOY_DIR, 'deployment-manifest.json')
const UNITS_DIR = join(DEPLOY_DIR, 'units')

type Unit = {
  name: string
  role: string
  target: string
  functionIds: string[]
  services: Array<{ capability: string; sourceServiceName: string }>
  handlers: Array<Record<string, unknown>>
  tags: string[]
  groupedBy?: {
    unit: string
    tags?: string[]
    addon?: string
    routes?: string[]
  }
  targetForcedBy?: string[]
}
type Manifest = {
  units: Unit[]
  queues: Array<{ name: string; consumerUnit: string }>
  scheduledTasks: Array<{ name: string; unitName: string }>
}

let failures = 0
let passes = 0

function check(name: string, fn: () => void) {
  try {
    fn()
    passes++
    console.log(`  ✔ ${name}`)
  } catch (e) {
    failures++
    console.log(`  ✖ ${name}`)
    console.log(`      ${(e as Error).message}`)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const originalConfig = readFileSync(CONFIG_FILE, 'utf-8')

function withGrouping(grouping: unknown | undefined): void {
  const config = JSON.parse(originalConfig)
  if (grouping === undefined) {
    delete config.deploy.grouping
  } else {
    config.deploy.grouping = grouping
  }
  writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`)
}

function runPlan():
  { ok: true; manifest: Manifest } | { ok: false; output: string } {
  try {
    execSync(`node ${PIKKU_BIN} deploy plan --provider cloudflare`, {
      cwd: FUNCTIONS_DIR,
      stdio: 'pipe',
      timeout: 600_000,
    })
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message: string }
    return {
      ok: false,
      output: `${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}${err.message}`,
    }
  }
  return {
    ok: true,
    manifest: JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8')),
  }
}

function functionUnits(manifest: Manifest): Unit[] {
  return manifest.units.filter((u) => u.role === 'function')
}

function restore() {
  writeFileSync(CONFIG_FILE, originalConfig)
}

process.on('exit', restore)
process.on('SIGINT', () => {
  restore()
  process.exit(130)
})

try {
  console.log('Setting up: pikku codegen against templates/functions...')
  execSync('rm -rf .deploy src/scaffold', { cwd: FUNCTIONS_DIR, stdio: 'pipe' })
  execSync(`node ${PIKKU_BIN}`, {
    cwd: FUNCTIONS_DIR,
    stdio: 'pipe',
    timeout: 120_000,
  })

  console.log('\nBaseline: no grouping block')
  withGrouping(undefined)
  const baseline = runPlan()
  assert(
    baseline.ok,
    `baseline plan failed:\n${!baseline.ok ? baseline.output : ''}`
  )
  const baseUnits = functionUnits(baseline.manifest)
  const baseNames = new Set(baseUnits.map((u) => u.name))

  check('the ungrouped build gives every function its own unit', () => {
    assert(
      baseUnits.every(
        (u) =>
          u.functionIds.length <= 1 ||
          u.name.startsWith('addon-') ||
          u.name.startsWith('run-remote')
      ),
      'an ungrouped unit holds more than one function without being an addon or job inbox'
    )
  })

  check('an ungrouped unit names no rule', () => {
    const named = baseUnits.filter((u) => u.groupedBy)
    assert(
      named.length === 0,
      `${named.map((u) => u.name).join(', ')} claim a rule with no grouping block`
    )
  })

  check(
    'a chosen server target names no service, a crossed one names a real one',
    () => {
      const incompatible = new Set(
        JSON.parse(originalConfig).deploy.serverlessIncompatible as string[]
      )
      const onServer = baseUnits.filter((u) => u.target === 'server')
      assert(
        onServer.length > 0,
        'the template built no server-target unit to check'
      )
      for (const unit of onServer) {
        for (const service of unit.targetForcedBy ?? []) {
          assert(
            incompatible.has(service),
            `${unit.name} blames ${service}, which is not in serverlessIncompatible`
          )
        }
      }
      const chosen = baseUnits.find((u) =>
        u.functionIds.includes('processReminder@v2')
      )
      assert(!!chosen, 'expected a unit holding processReminder@v2')
      assert(
        chosen!.target === 'server' && !chosen!.targetForcedBy,
        `${chosen!.name} holds a function that declared deploy: 'server', so nothing crossed it and it must name nothing`
      )
    }
  )

  const todoUnits = baseUnits.filter((u) => u.tags.includes('todos'))
  check('the template has several todos-tagged units to merge', () => {
    assert(
      todoUnits.length > 1,
      `expected >1 todos-tagged units to merge, found ${todoUnits.length}`
    )
  })

  console.log('\nGrouped: one unit for everything tagged todos')
  withGrouping({ rules: [{ unit: 'todos', tags: ['todos'] }] })
  const grouped = runPlan()
  assert(
    grouped.ok,
    `grouped plan failed:\n${!grouped.ok ? grouped.output : ''}`
  )
  const groupedUnits = functionUnits(grouped.manifest)
  const todos = groupedUnits.find((u) => u.name === 'todos')

  check('the rule produces a single named unit', () => {
    assert(todos, 'no unit named "todos" in the manifest')
  })

  check('the merged unit names the rule that made it', () => {
    assert(
      JSON.stringify(todos!.groupedBy) ===
        JSON.stringify({ unit: 'todos', tags: ['todos'] }),
      `expected the todos rule, got ${JSON.stringify(todos!.groupedBy)}`
    )
  })

  check('it holds every function the rule matched', () => {
    assert(
      todos!.functionIds.length === todoUnits.length,
      `expected ${todoUnits.length} functionIds, got ${todos!.functionIds.length}`
    )
  })

  check('the units it replaced are gone', () => {
    for (const replaced of todoUnits) {
      assert(
        !groupedUnits.some((u) => u.name === replaced.name),
        `${replaced.name} still has its own unit`
      )
    }
  })

  check('the build ends up with fewer units than ungrouped', () => {
    assert(
      groupedUnits.length < baseUnits.length,
      `grouped ${groupedUnits.length} is not fewer than baseline ${baseUnits.length}`
    )
  })

  check('every other unit is untouched', () => {
    for (const unit of groupedUnits) {
      if (unit.name === 'todos') continue
      assert(
        baseNames.has(unit.name),
        `${unit.name} appeared only in the grouped build`
      )
    }
  })

  check('routes from every member are on one fetch handler', () => {
    const fetchHandlers = todos!.handlers.filter((h) => h.type === 'fetch')
    assert(
      fetchHandlers.length === 1,
      `expected 1 fetch handler, got ${fetchHandlers.length}`
    )
    const routes = (fetchHandlers[0] as { routes: unknown[] }).routes
    const baselineRoutes = todoUnits.flatMap((u) =>
      u.handlers
        .filter((h) => h.type === 'fetch')
        .flatMap((h) => (h as { routes: unknown[] }).routes)
    )
    assert(
      routes.length === baselineRoutes.length,
      `expected ${baselineRoutes.length} routes on the merged handler, got ${routes.length}`
    )
  })

  check('services are the union of the members', () => {
    const expected = new Set(
      todoUnits.flatMap((u) => u.services.map((s) => s.sourceServiceName))
    )
    const actual = new Set(todos!.services.map((s) => s.sourceServiceName))
    for (const name of expected) {
      assert(actual.has(name), `merged unit lost the ${name} service`)
    }
  })

  check('the merged unit actually bundles', () => {
    const bundle = join(UNITS_DIR, 'todos', 'bundle.js')
    assert(existsSync(bundle), `no bundle at ${bundle}`)
    assert(statSync(bundle).size > 0, 'the merged bundle is empty')
  })

  check('no queue or cron points at a unit that no longer exists', () => {
    const names = new Set(grouped.manifest.units.map((u) => u.name))
    for (const queue of grouped.manifest.queues) {
      assert(
        names.has(queue.consumerUnit),
        `queue ${queue.name} points at missing unit ${queue.consumerUnit}`
      )
    }
    for (const task of grouped.manifest.scheduledTasks) {
      assert(
        names.has(task.unitName),
        `cron ${task.name} points at missing unit ${task.unitName}`
      )
    }
  })

  check('no unit depends on a unit that no longer exists', () => {
    const names = new Set(grouped.manifest.units.map((u) => u.name))
    for (const unit of grouped.manifest.units) {
      for (const dep of (unit as unknown as { dependsOn: string[] })
        .dependsOn) {
        assert(names.has(dep), `${unit.name} depends on missing unit ${dep}`)
      }
    }
  })

  console.log('\nRefusal: a group spanning both deploy targets')
  withGrouping({ strategy: 'single' })
  const mixed = runPlan()

  check('a group spanning serverless and server is refused', () => {
    assert(!mixed.ok, 'the build succeeded when it should have refused')
  })

  check('the refusal names the unit and both sides', () => {
    assert(!mixed.ok, 'no output to inspect')
    assert(
      mixed.output.includes('would hold both serverless and server functions'),
      `unexpected failure:\n${mixed.output.slice(-2000)}`
    )
  })

  console.log('\nRefusal: two rules naming one unit')
  withGrouping({
    rules: [
      { unit: 'dup', tags: ['todos'] },
      { unit: 'dup', tags: ['realtime'] },
    ],
  })
  const dup = runPlan()

  check('a duplicate unit name is refused', () => {
    assert(!dup.ok, 'the build succeeded with two rules naming one unit')
    assert(
      dup.output.includes('two rules both name the unit'),
      `unexpected failure:\n${dup.output.slice(-2000)}`
    )
  })

  console.log('\nRefusal: a rule with no predicate')
  withGrouping({ rules: [{ unit: 'empty' }] })
  const empty = runPlan()

  check('a rule matching nothing is refused', () => {
    assert(!empty.ok, 'the build succeeded with a predicate-less rule')
    assert(
      empty.output.includes('matches nothing'),
      `unexpected failure:\n${empty.output.slice(-2000)}`
    )
  })
} finally {
  restore()
}

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures > 0 ? 1 : 0)
