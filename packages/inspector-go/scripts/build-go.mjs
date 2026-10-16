// Builds the pikku-inspect binary.
//
//   node scripts/build-go.mjs            host build into bin/ for local
//                                        development; without a Go toolchain
//                                        it warns and exits 0, so the package
//                                        still builds (the binary then comes
//                                        from PIKKU_INSPECTOR_GO_BIN or the
//                                        per-platform package)
//   node scripts/build-go.mjs --strict   host build that fails without go
//   node scripts/build-go.mjs --all      release build of every target into
//                                        npm/<platform>-<arch>/bin/
//   node scripts/build-go.mjs --target linux-x64 [--target ...]
//
// Release builds are static (CGO_ENABLED=0), reproducible (-trimpath) and
// stripped (-s -w). Any failure in --all/--target/--strict exits non-zero.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORMS, executableName, targetName } from './platforms.mjs'

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN = './cmd/pikku-inspect'

const args = process.argv.slice(2)
const targets = []
let all = false
let strict = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--all') all = true
  else if (args[i] === '--strict') strict = true
  else if (args[i] === '--target') targets.push(args[++i])
  else {
    console.error(`build-go: unknown argument ${args[i]}`)
    process.exit(2)
  }
}

const fail = (message) => {
  console.error(`@pikku/inspector-go: ${message}`)
  process.exit(1)
}

const probe = spawnSync('go', ['version'], { stdio: 'ignore' })
const hasGo = !probe.error && probe.status === 0

if (!all && targets.length === 0) {
  if (!hasGo) {
    if (strict) fail('go not found on PATH')
    console.warn(
      '@pikku/inspector-go: go not found, skipping bin/pikku-inspect'
    )
    process.exit(0)
  }
  const out = join('bin', executableName(process.platform))
  const build = spawnSync('go', ['build', '-o', out, MAIN], {
    cwd: PKG_DIR,
    stdio: 'inherit',
  })
  if (build.status !== 0) {
    if (strict) fail(`go build failed, ${out} not updated`)
    console.warn(`@pikku/inspector-go: go build failed, ${out} not updated`)
  }
  // The workspace links npm/<host> as the installed platform package, which
  // findInspectorBinary prefers to bin/. Release builds leave it in place.
  const host = PLATFORMS.find(
    (p) => p.platform === process.platform && p.arch === process.arch
  )
  const shadow =
    host && join('npm', targetName(host), 'bin', executableName(host.platform))
  if (shadow && existsSync(join(PKG_DIR, shadow))) {
    console.warn(
      `@pikku/inspector-go: ${shadow} (from --all/--target) is resolved before ${out}; delete it to use this build`
    )
  }
  process.exit(0)
}

if (!hasGo) fail('go not found on PATH, cannot cross-compile')

const selected = all
  ? PLATFORMS
  : targets.map((name) => {
      const target = PLATFORMS.find((p) => targetName(p) === name)
      if (!target) {
        fail(
          `unknown target ${name}; known: ${PLATFORMS.map(targetName).join(', ')}`
        )
      }
      return target
    })

for (const target of selected) {
  const name = targetName(target)
  const out = join(PKG_DIR, 'npm', name, 'bin', executableName(target.platform))
  mkdirSync(dirname(out), { recursive: true })
  const started = Date.now()
  const build = spawnSync(
    'go',
    ['build', '-trimpath', '-ldflags', '-s -w', '-o', out, MAIN],
    {
      cwd: PKG_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        CGO_ENABLED: '0',
        GOOS: target.goos,
        GOARCH: target.goarch,
      },
    }
  )
  if (build.status !== 0) fail(`go build for ${name} failed`)
  const mb = (statSync(out).size / 1024 / 1024).toFixed(1)
  console.log(
    `built ${relative(PKG_DIR, out)} (${mb} MB, ${((Date.now() - started) / 1000).toFixed(1)}s)`
  )
}
