import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const ADDON_BOOTSTRAP_IMPORT =
  '@pikku/templates-function-addon/.pikku/pikku-bootstrap.gen.js'

interface Scenario {
  name: string
  filterNames: string
  addonImported: boolean
  greetingStore: boolean
  auditSink: boolean
  why: string
}

const scenarios: Scenario[] = [
  {
    name: 'no-addon',
    filterNames: 'noAddonPing',
    addonImported: false,
    greetingStore: false,
    auditSink: false,
    why: 'unit touches nothing addon-related',
  },
  {
    name: 'goodbye',
    filterNames: 'testAddonGoodbye',
    addonImported: true,
    greetingStore: false,
    auditSink: false,
    why: 'body-invoked addon fn uses only default services',
  },
  {
    name: 'hello',
    filterNames: 'testAddonHello',
    addonImported: true,
    greetingStore: true,
    auditSink: true,
    why: 'addon fn uses addon-created noop → factory → full parent set',
  },
  {
    name: 'greet-ref',
    filterNames: 'http:post:/treeshake/greet-from-store',
    addonImported: true,
    greetingStore: true,
    auditSink: false,
    why: 'ref()-wired addon fn declares exactly greetingStore',
  },
  {
    name: 'mixed-caller',
    filterNames: 'mixedAddonCaller',
    addonImported: true,
    greetingStore: false,
    auditSink: false,
    why: 'body-invoked addon fn from a shared file uses only defaults',
  },
  {
    name: 'mixed-plain',
    filterNames: 'mixedPlain',
    addonImported: true,
    greetingStore: false,
    auditSink: false,
    why: 'file-granular attribution keeps the addon for file-mates (conservative)',
  },
]

const flag = (servicesGen: string, service: string): boolean => {
  const match = servicesGen.match(new RegExp(`'${service}': (true|false)`))
  if (!match) throw new Error(`service '${service}' missing from services map`)
  return match[1] === 'true'
}

console.log('\nAddon Tree-Shaking Verifier')
console.log('===========================\n')

let passed = true
const check = (scenario: string, label: string, ok: boolean) => {
  console.log(`${ok ? '✓' : '✗'} [${scenario}] ${label}`)
  if (!ok) passed = false
}

for (const scenario of scenarios) {
  const outDir = join(rootDir, '.pikku-shake', scenario.name)
  rmSync(outDir, { recursive: true, force: true })
  execFileSync(
    'npx',
    [
      'pikku',
      'all',
      `--names=${scenario.filterNames}`,
      `--outDir=${outDir}`,
      '--force-relative-imports',
      '--silent',
    ],
    { cwd: rootDir, stdio: 'pipe' }
  )

  const bootstrap = readFileSync(join(outDir, 'pikku-bootstrap.gen.ts'), 'utf8')
  const servicesGen = readFileSync(
    join(outDir, 'pikku-services.gen.ts'),
    'utf8'
  )

  check(
    scenario.name,
    `addon bootstrap ${scenario.addonImported ? 'imported' : 'NOT imported'} (${scenario.why})`,
    bootstrap.includes(ADDON_BOOTSTRAP_IMPORT) === scenario.addonImported
  )
  check(
    scenario.name,
    `greetingStore: ${scenario.greetingStore}`,
    flag(servicesGen, 'greetingStore') === scenario.greetingStore
  )
  check(
    scenario.name,
    `auditSink: ${scenario.auditSink}`,
    flag(servicesGen, 'auditSink') === scenario.auditSink
  )
}

if (!passed) {
  console.log('\n✗ Addon tree-shaking verification FAILED')
  process.exit(1)
}
console.log('\n✓ Addon tree-shaking verification passed')
