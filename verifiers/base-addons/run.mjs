/**
 * A root project that lists an addon and a plain package in pikkuDirectories.
 *
 *   1. pikku all at the root runs pikku all in each listed package
 *   2. the plain package declares no backends and no frontends, and needs none
 *   3. the root's exposed SDK carries the root's function and the exposed
 *      functions of both packages, namespaced by the namespace each package's config declares
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PIKKU = join(resolve(here, '../..'), 'packages/cli/dist/bin/pikku.js')
const fail = (message) => {
  console.error(`✗ ${message}`)
  process.exit(1)
}

for (const pkg of ['addon', 'plain']) {
  rmSync(join(here, 'packages', pkg, '.pikku'), { recursive: true, force: true })
}
rmSync(join(here, '.pikku'), { recursive: true, force: true })
const run = spawnSync('node', [PIKKU, 'all'], { cwd: here, encoding: 'utf8' })
if (run.status !== 0) {
  console.error(run.stdout + run.stderr)
  fail('pikku all failed at the root')
}
console.log('✓ pikku all ran at the root')

for (const pkg of ['addon', 'plain']) {
  if (!existsSync(join(here, 'packages', pkg, '.pikku'))) {
    fail(`packages/${pkg} was not generated`)
  }
}
console.log('✓ each listed package was generated')

const manifest = JSON.parse(
  readFileSync(join(here, '.pikku/sdk/api/manifest.json'), 'utf8')
)
const want = ['ping', 'shared:shout', 'tools:greet']
if (JSON.stringify(manifest.exposed) !== JSON.stringify(want)) {
  fail(`exposed was ${JSON.stringify(manifest.exposed)}, wanted ${JSON.stringify(want)}`)
}
console.log('✓ the root SDK carries the packages exposed functions')

const map = readFileSync(
  join(here, '.pikku/sdk/api/exposed/contract/rpc/pikku-rpc-wirings-map.gen.d.ts'),
  'utf8'
)
if (/'hidden'/.test(map)) fail('a function that is not exposed reached the SDK')
console.log('✓ a function that is not exposed stays out')
