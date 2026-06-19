/**
 * addon-carve verifier.
 *
 * Two real pikku projects in sibling folders, each with its own
 * pikku.config.json:
 *   source/   — defines functions
 *   consumer/ — wires and calls the carved addons
 *
 * The orchestration mirrors the real publish flow:
 *   1. codegen the source project
 *   2. `pikku new addon <name> --carve --names <fn>` carves a few addons
 *   3. build each addon (pikku all + tsc + cp .pikku dist)
 *   4. link each into node_modules as a published package would be
 *   5. codegen the consumer and `tsc --noEmit` it against the addons
 *
 * Any failing step exits non-zero, failing the verifier.
 */
import { execFileSync } from 'node:child_process'
import { rmSync, mkdirSync, symlinkSync, cpSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const cli = join(root, 'packages/cli/dist/bin/pikku.js')
const tsc = join(root, 'node_modules/.bin/tsc')

const sourceDir = join(here, 'source')
const consumerDir = join(here, 'consumer')
const genDir = join(here, 'generated')

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })

// The few addons carved out of the one source project, selected by function
// name via the global `--names` filter.
const addons = [
  { name: 'greeter', names: 'greet' },
  { name: 'farewell', names: 'farewell' },
]

console.log('\n[addon-carve] 1. codegen source')
run('node', [cli, 'all'], sourceDir)

rmSync(genDir, { recursive: true, force: true })
mkdirSync(genDir, { recursive: true })
mkdirSync(join(root, 'node_modules/@pikku'), { recursive: true })

for (const { name, names } of addons) {
  console.log(`\n[addon-carve] 2. carve addon '${name}' (--names ${names})`)
  run(
    'node',
    [cli, 'new', 'addon', name, '--carve', '--names', names, '--dir', genDir, '--test', 'false'],
    sourceDir
  )

  const addonDir = join(genDir, name)
  console.log(`[addon-carve] 3. build addon '${name}'`)
  run('node', [cli, 'all'], addonDir)
  run(tsc, [], addonDir)
  cpSync(join(addonDir, '.pikku'), join(addonDir, 'dist/.pikku'), {
    recursive: true,
  })

  // 4. resolve the addon as a published package would be.
  const link = join(root, 'node_modules/@pikku', `addon-${name}`)
  rmSync(link, { recursive: true, force: true })
  symlinkSync(addonDir, link)
}

console.log('\n[addon-carve] 5. codegen + typecheck consumer against the addons')
run('node', [cli, 'all'], consumerDir)
run(tsc, ['--noEmit'], consumerDir)

console.log('\n✓ addon-carve verifier passed')
