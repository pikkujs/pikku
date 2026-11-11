import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createScriptContent, getText } from './script-content.js'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
// The content store is the generated output directory: the CLI writes to
// <root>/private/shake/<name>, and the script reads and clears it through the
// content service.
const content = createScriptContent(join(rootDir, '.pikku-shake'))
const outDirOf = (name: string) =>
  join(rootDir, '.pikku-shake', 'private', 'shake', name)
const clearOut = (name: string) => content.deleteByPrefix('shake', `${name}/`)
const readOut = (name: string, file: string) =>
  getText(content, 'shake', `${name}/${file}`)
const ADDON_BOOTSTRAP_IMPORT =
  '@pikku/templates-function-addon/.pikku/pikku-bootstrap.gen.js'
const WIRE_ADDON_FILE_IMPORT = 'src/function/treeshake.wiring.js'

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
  const outDir = outDirOf(scenario.name)
  await clearOut(scenario.name)
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

  const bootstrap = await readOut(scenario.name, 'pikku-bootstrap.gen.ts')
  const servicesGen = await readOut(scenario.name, 'pikku-services.gen.ts')

  check(
    scenario.name,
    `addon bootstrap ${scenario.addonImported ? 'imported' : 'NOT imported'} (${scenario.why})`,
    bootstrap.includes(ADDON_BOOTSTRAP_IMPORT) === scenario.addonImported
  )
  check(
    scenario.name,
    `wireAddon file ${scenario.addonImported ? 'imported' : 'NOT imported'}`,
    bootstrap.includes(WIRE_ADDON_FILE_IMPORT) === scenario.addonImported
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

// A Cloudflare unit's bootstrap defers the addon's functions and schemas to
// loadAddons(), so evaluating it at Worker startup registers neither.
{
  const outDir = outDirOf('lazy')
  await clearOut('lazy')
  execFileSync(
    'npx',
    [
      'pikku',
      'all',
      '--names=testAddonHello',
      `--outDir=${outDir}`,
      '--force-relative-imports',
      '--lazy-addons',
      '--silent',
    ],
    { cwd: rootDir, stdio: 'pipe' }
  )
  const bootstrap = await readOut('lazy', 'pikku-bootstrap.gen.ts')
  const addon = '@pikku/templates-function-addon/.pikku'

  check(
    'lazy',
    'addon bootstrap not imported whole',
    !bootstrap.includes(ADDON_BOOTSTRAP_IMPORT)
  )
  check(
    'lazy',
    'addon meta imported up front',
    bootstrap.includes(`import '${addon}/function/pikku-functions-meta.gen.js'`)
  )
  check(
    'lazy',
    'addon functions and schemas only imported from loadAddons()',
    !bootstrap.includes(`import '${addon}/function/pikku-functions.gen.js'`) &&
      bootstrap.includes(`import('${addon}/function/pikku-functions.gen.js')`)
  )

  const registered = JSON.parse(
    execFileSync(
      'npx',
      [
        'tsx',
        join(rootDir, 'src', 'lazy-addons.check.ts'),
        join(outDir, 'pikku-bootstrap.gen.ts'),
      ],
      { cwd: rootDir, stdio: 'pipe' }
    ).toString()
  ) as { atStartup: number; afterLoadAddons: number }
  check(
    'lazy',
    `no addon function registered at startup (${registered.atStartup})`,
    registered.atStartup === 0
  )
  check(
    'lazy',
    `loadAddons() registers them (${registered.afterLoadAddons})`,
    registered.afterLoadAddons > 0
  )
}

if (!passed) {
  console.log('\n✗ Addon tree-shaking verification FAILED')
  process.exit(1)
}
console.log('\n✓ Addon tree-shaking verification passed')
