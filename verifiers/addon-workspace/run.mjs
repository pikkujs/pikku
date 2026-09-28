/**
 * An addon declared by a workspace package, not by the project root.
 *
 * `pikku.config.json` sits at this directory; the function that calls
 * `wireAddon` lives in `functions/`, whose package.json is the only one that
 * lists the addon. Bun links a workspace dependency only into the package that
 * declares it, so the addon is in `functions/node_modules` and nowhere above.
 * Codegen has to resolve it from there, the way the wiring's own import does
 * at runtime.
 *
 *   1. the layout really is split — the addon is absent from this root
 *   2. pikku all                → exits 0, no ADDON_NOT_INSTALLED
 *   3. the generated function types → carry the addon's published contracts
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const ADDON_PKG = '@pikku/templates-function-addon'

const fail = (message) => {
  console.error(`✗ ${message}`)
  process.exit(1)
}

if (existsSync(join(here, 'node_modules', ADDON_PKG))) {
  fail(`${ADDON_PKG} is installed at the project root, so this proves nothing`)
}
if (!existsSync(join(here, 'functions', 'node_modules', ADDON_PKG))) {
  fail(`${ADDON_PKG} is not linked into functions/ — run bun install`)
}
console.log('✓ the addon is installed only in the declaring package')

rmSync(join(here, '.pikku'), { recursive: true, force: true })
const run = spawnSync('node', [PIKKU, 'all'], { cwd: here, encoding: 'utf8' })
const output = `${run.stdout}${run.stderr}`
if (run.status !== 0 || /cannot be resolved/.test(output)) {
  console.error(output)
  fail(`pikku all failed to resolve ${ADDON_PKG} from functions/`)
}
console.log('✓ pikku all resolves the addon from the declaring package')

const functionTypes = join(
  here,
  '.pikku',
  'function',
  'pikku-function-types.gen.ts'
)
if (
  !existsSync(functionTypes) ||
  !readFileSync(functionTypes, 'utf8').includes('"ext:helloRoutes"')
) {
  fail(`the addon's published contracts never reached ${functionTypes}`)
}
console.log('✓ the addon’s metadata was loaded from the declaring package')
