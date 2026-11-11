/**
 * One addon calling another, typed, through the other's SDK.
 *
 * `billing/package.json` declares `pikku.uses: { stripe:
 * '@pikku/verifiers-addon-deps-stripe@^1.0.0' }`; the stripe addon is a package
 * in this workspace, so billing's `pikku all` reads the SDK stripe generated
 * in place rather than fetching one from the registry.
 *
 *   1. stripe: pikku all       → writes .pikku/sdk/ at 1.2.0
 *   2. billing: pikku all      → its internal RPC map imports stripe's SDK
 *                                under the alias 'stripe'
 *   3. billing: tsc --noEmit   → rpc.invoke('stripe:charge') is typed by that
 *                                SDK (type-tests/invoke.assert.ts)
 *   4. billing at '^2.0.0'     → pikku all fails with PKU354: the workspace copy
 *                                is 1.2.0
 *
 * Then `host/`, an app that wires both, has to give billing the stripe it
 * declared:
 *
 *   5. uses: { stripe: 'payments' }   → pikku all passes
 *   6. no uses                        → PKU348, the dependency is not mapped
 *   7. uses maps an undeclared key    → PKU355, billing may not reach it
 *   8. billing asking for ^2.0.0      → PKU354, the app wired stripe 1.2.0
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const TSC = join(repoRoot, 'node_modules/.bin/tsc')
const stripeDir = join(here, 'stripe')
const billingDir = join(here, 'billing')
const hostDir = join(here, 'host')

class CheckFailed extends Error {}

/** Throws rather than exits, so withFile puts an edited fixture back first. */
const fail = (message, output) => {
  if (output) console.error(output)
  console.error(`✗ ${message}`)
  throw new CheckFailed(message)
}

process.on('uncaughtException', (error) => {
  if (!(error instanceof CheckFailed)) console.error(error)
  process.exit(1)
})

const run = (file, args, cwd) => {
  const result = spawnSync(file, args, { cwd, encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const stripe = run('node', [PIKKU, 'all'], stripeDir)
if (stripe.status !== 0) fail('pikku all failed in stripe', stripe.output)
const manifestPath = join(stripeDir, '.pikku', 'sdk', 'manifest.json')
if (!existsSync(manifestPath)) fail(`stripe wrote no SDK at ${manifestPath}`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.version !== '1.2.0') {
  fail(`stripe's SDK is ${manifest.version}, not 1.2.0`)
}
console.log('✓ stripe generated its SDK at 1.2.0')

const billing = run('node', [PIKKU, 'all'], billingDir)
if (billing.status !== 0) fail('pikku all failed in billing', billing.output)
const internalMap = readFileSync(
  join(
    billingDir,
    '.pikku',
    'addon',
    'rpc',
    'pikku-rpc-wirings-map.internal.gen.d.ts'
  ),
  'utf8'
)
if (
  !internalMap.includes(
    "from '../../../../stripe/.pikku/sdk/rpc/pikku-rpc-wirings-map.remote.gen.js'"
  ) ||
  !internalMap.includes("PrefixKeys<StripeRPCMap, 'stripe'>")
) {
  fail(
    "billing's internal RPC map does not import stripe's SDK as 'stripe'",
    internalMap
  )
}
console.log("✓ billing's RPC map takes 'stripe:*' from stripe's workspace SDK")

const tsc = run(TSC, ['--noEmit', '-p', 'tsconfig.json'], billingDir)
if (tsc.status !== 0) fail('billing does not type-check', tsc.output)
console.log("✓ rpc.invoke('stripe:charge') is typed by stripe's SDK")

const withFile = (path, edit, check) => {
  const original = readFileSync(path, 'utf8')
  try {
    writeFileSync(path, edit(original))
    check()
  } finally {
    writeFileSync(path, original)
  }
}

const expectFailure = (cwd, code, message) => {
  const result = run('node', [PIKKU, 'all'], cwd)
  if (result.status === 0 || !result.output.includes(code)) {
    fail(message, result.output)
  }
}

const askForStripe2 = (text) =>
  text.replace(
    '@pikku/verifiers-addon-deps-stripe@^1.0.0',
    '@pikku/verifiers-addon-deps-stripe@^2.0.0'
  )

withFile(join(billingDir, 'package.json'), askForStripe2, () =>
  expectFailure(
    billingDir,
    'PKU354',
    'billing built against stripe 1.2.0 while asking for ^2.0.0'
  )
)
console.log('✓ a range the workspace copy does not satisfy fails with PKU354')

const host = run('node', [PIKKU, 'all'], hostDir)
if (host.status !== 0) {
  fail('the app that gives billing its stripe does not build', host.output)
}
console.log('✓ an app that maps stripe for billing builds')

const wiringPath = join(hostDir, 'src', 'addons.wiring.ts')
const MAPPED = "uses: { stripe: 'payments' },"

withFile(
  wiringPath,
  (text) => text.replace(MAPPED, ''),
  () =>
    expectFailure(
      hostDir,
      'PKU348',
      'the app built without mapping the stripe billing declares'
    )
)
console.log('✓ an app that does not map the dependency fails with PKU348')

withFile(
  wiringPath,
  (text) =>
    text.replace(MAPPED, "uses: { stripe: 'payments', vault: 'payments' },"),
  () =>
    expectFailure(
      hostDir,
      'PKU355',
      'the app let billing reach a name it never declared'
    )
)
console.log('✓ an app that grants an undeclared name fails with PKU355')

withFile(join(billingDir, 'package.json'), askForStripe2, () =>
  expectFailure(
    hostDir,
    'PKU354',
    'the app wired stripe 1.2.0 for an addon that asks for ^2.0.0'
  )
)
console.log('✓ an app that wires a version the range refuses fails with PKU354')
