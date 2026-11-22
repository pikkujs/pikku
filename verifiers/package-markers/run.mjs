/**
 * A root project whose workspace holds an addon and a main package, found by their markers.
 *
 *   1. pikku all at the root runs pikku all in the addon, then in the main package
 *   1a. the main package's config holds only `"main": true`, and its pass reads
 *       the root's settings: its virtual user names the root's `local`
 *       environment and takes its address from the root's `scenarios.emailDomain`
 *   2. the root inspects the main package's source in place: its http meta carries its routes
 *   3. the root's exposed SDK carries the main package's exposed function as `ping` and the addon's as `tools:greet`
 *   4. the root bootstrap imports the main package's wirings, never its own bootstrap
 *   5. the main package's route runs, and reaches the addon through `tools:greet`
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const TSX = join(repoRoot, 'node_modules/.bin/tsx')
const fail = (message) => {
  console.error(`✗ ${message}`)
  process.exit(1)
}

for (const dir of ['.', 'packages/tools', 'packages/app']) {
  rmSync(join(here, dir, '.pikku'), { recursive: true, force: true })
}
const run = spawnSync('node', [PIKKU, 'all'], { cwd: here, encoding: 'utf8' })
if (run.status !== 0) {
  console.error(run.stdout + run.stderr)
  fail('pikku all failed at the root')
}
console.log('✓ pikku all ran at the root')

for (const pkg of ['tools', 'app']) {
  if (!existsSync(join(here, 'packages', pkg, '.pikku'))) {
    fail(`packages/${pkg} was not generated`)
  }
}
console.log('✓ the addon and the main package were generated')

const virtualUsers = JSON.parse(
  readFileSync(
    join(here, 'packages/app/.pikku/workflow/virtual-users.gen.json'),
    'utf8'
  )
)
const saboteur = virtualUsers.saboteur
if (JSON.stringify(saboteur?.environments) !== JSON.stringify(['local'])) {
  fail(
    `the main package's virtual user has environments ${JSON.stringify(saboteur?.environments)}, wanted ["local"]`
  )
}
if (saboteur.email !== 'saboteur@virtualuser.invalid') {
  fail(
    `the main package's pass did not read the root's scenarios.emailDomain: email was ${saboteur.email}`
  )
}
console.log(
  "✓ the main package's pass reads the root's environments and scenarios"
)

const http = JSON.parse(
  readFileSync(
    join(here, '.pikku/http/pikku-http-wirings-meta.gen.json'),
    'utf8'
  )
)
for (const route of ['/ping', '/greet', '/stamp']) {
  if (!http.get?.[route]) fail(`the root http meta has no ${route}`)
}
console.log('✓ the root http meta carries the main package routes')

const manifest = JSON.parse(
  readFileSync(join(here, '.pikku/sdk/api/manifest.json'), 'utf8')
)
const want = ['ping', 'tools:greet']
if (JSON.stringify(manifest.exposed) !== JSON.stringify(want)) {
  fail(
    `exposed was ${JSON.stringify(manifest.exposed)}, wanted ${JSON.stringify(want)}`
  )
}
console.log(
  '✓ the SDK carries the main package function and the addon function'
)

const map = readFileSync(
  join(
    here,
    '.pikku/sdk/api/exposed/contract/rpc/pikku-rpc-wirings-map.gen.d.ts'
  ),
  'utf8'
)
if (/'hidden'/.test(map)) fail('a function that is not exposed reached the SDK')
console.log('✓ a function that is not exposed stays out')

// The addon declares `farewell` exposed too, but the main package's wireAddon lists only
// `greet`: the allowlist is the main package's, so the map is narrowed to it.
if (/'(tools:)?farewell'/.test(map)) {
  fail(
    "an addon function outside the main package's expose list reached the SDK"
  )
}
if (!/Pick<ToolsRPCMap, Extract<keyof ToolsRPCMap, 'greet'>>/.test(map)) {
  fail(
    "the SDK map does not narrow the addon to the main package's expose list"
  )
}
console.log(
  "✓ the main package's expose list narrows the addon's functions in the SDK"
)

const bootstrap = readFileSync(
  join(here, '.pikku/pikku-bootstrap.gen.ts'),
  'utf8'
)
if (/packages\/app\/\.pikku/.test(bootstrap)) {
  fail("the root bootstrap imports the main package's own bootstrap")
}
if (!bootstrap.includes('packages/app/src/app.wiring')) {
  fail("the root bootstrap does not import the main package's wirings")
}
console.log(
  "✓ the root bootstrap imports the main package's wirings, not its bootstrap"
)

const smoke = spawnSync(TSX, ['smoke.ts'], { cwd: here, encoding: 'utf8' })
if (smoke.status !== 0) {
  console.error(smoke.stdout + smoke.stderr)
  fail('the runtime smoke test failed')
}
console.log(
  smoke.stdout
    .split('\n')
    .filter((l) => l.startsWith('✓'))
    .join('\n')
)
