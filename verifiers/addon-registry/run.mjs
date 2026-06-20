/**
 * Registry pack/install round-trip verifier.
 *
 * Mirrors the real registry flow without the network: `pikku fabric publish`
 * packs with `npm pack`, and `pikku fabric add` extracts into
 * `node_modules/<name>` with `--strip-components=1` (the location
 * `wireAddon({ package })` resolves). This harness does the same locally:
 *   1. `pikku all` on the source addon
 *   2. `npm pack` the addon → tgz                          (publish artifact)
 *   3. extract into consumer/node_modules/<name>, strip 1  (add install)
 *   4. `pikku all` + `tsc --noEmit` in the consumer
 *   5. invoke consumeHello → rpc.invoke('ext:hello') and assert the result
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const sourceDir = join(here, 'source')
const consumerDir = join(here, 'consumer')

const PIKKU = join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const TSC = join(repoRoot, 'node_modules/.bin/tsc')
const TSX = join(repoRoot, 'node_modules/.bin/tsx')
const ADDON_PKG = '@pikku/verifier-registry-addon'

function run(label, file, args, cwd) {
  console.log(`\n▶ ${label}`)
  console.log(`  ${file} ${args.join(' ')}  (cwd: ${cwd.replace(repoRoot, '.')})`)
  execFileSync(file, args, { cwd, stdio: 'inherit' })
}

function capture(file, args, cwd) {
  return execFileSync(file, args, { cwd, encoding: 'utf8' })
}

// 1. Build the source addon
run('source: pikku all', 'node', [PIKKU, 'all'], sourceDir)

// 2. Pack the addon — npm pack respects the `files` field (src + .pikku)
console.log('\n▶ source: npm pack')
const packOut = capture('npm', ['pack', '--json'], sourceDir)
const tgzName = JSON.parse(packOut)[0].filename
const tgzPath = join(sourceDir, tgzName)
if (!existsSync(tgzPath)) {
  throw new Error(`npm pack did not produce ${tgzPath}`)
}
console.log(`  packed → ${tgzName}`)

// 3. Install: extract tgz into consumer/node_modules/<addon>
const installDir = join(consumerDir, 'node_modules', ADDON_PKG)
rmSync(installDir, { recursive: true, force: true })
mkdirSync(installDir, { recursive: true })
run(
  'consumer: extract artifact into node_modules',
  'tar',
  ['-xzf', tgzPath, '-C', installDir, '--strip-components=1'],
  consumerDir
)
console.log(`  installed files: ${readdirSync(installDir).join(', ')}`)

// 4. Build + type-check the consumer against the installed artifact
run('consumer: pikku all', 'node', [PIKKU, 'all'], consumerDir)
run('consumer: tsc --noEmit', TSC, ['--noEmit', '-p', 'tsconfig.json'], consumerDir)

// 5. Runtime invoke — prove the installed addon actually runs over RPC
run('consumer: runtime invoke', TSX, ['src/start.ts'], consumerDir)

// Cleanup the artifact (keep node_modules install for debugging)
rmSync(tgzPath, { force: true })

console.log('\n✓ registry pack/install round-trip passed')
